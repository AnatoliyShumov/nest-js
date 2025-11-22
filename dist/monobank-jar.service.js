"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonobankJarService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("axios");
const telegram_service_1 = require("./telegram.service");
const fs = require("fs");
const path = require("path");
let MonobankJarService = class MonobankJarService {
    constructor(telegram) {
        this.telegram = telegram;
        this.token = process.env.MONOBANK_TOKEN;
        this.jarId = process.env.MONOBANK_JAR_ID;
        this.stateFilePath = path.resolve(__dirname, '..', 'last-state.json');
        this.state = this.loadState();
        this.isProcessing = false;
    }
    onModuleInit() {
        this.startChecking();
    }
    startChecking() {
        setInterval(() => this.checkJarTransactions(), 60000);
    }
    async checkJarTransactions() {
        if (this.isProcessing)
            return;
        this.isProcessing = true;
        const now = Math.floor(Date.now() / 1000);
        const since = now - 31 * 86400;
        const url = `https://api.monobank.ua/personal/statement/${this.jarId}/${since}/${now}`;
        try {
            const res = await axios_1.default.get(url, {
                headers: { 'X-Token': this.token },
            });
            const transactions = res.data.reverse();
            const newTxs = this.state.lastTxnId
                ? this.skipUntilLastId(transactions, this.state.lastTxnId)
                : transactions;
            const currentMonth = new Date().getMonth();
            const nowDate = new Date();
            const startOfWeek = new Date(nowDate);
            const dayOfWeek = nowDate.getDay();
            const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            startOfWeek.setDate(nowDate.getDate() - daysToMonday);
            startOfWeek.setHours(0, 0, 0, 0);
            const startOfLastWeek = new Date(startOfWeek);
            startOfLastWeek.setDate(startOfWeek.getDate() - 7);
            const sumBy = (filterFn) => transactions.filter(tx => tx.amount > 0 && filterFn(tx)).reduce((sum, tx) => sum + tx.amount, 0) / 100;
            const totalMonth = sumBy(tx => new Date(tx.time * 1000).getMonth() === currentMonth);
            const totalWeek = sumBy(tx => new Date(tx.time * 1000) >= startOfWeek);
            const totalLastWeek = sumBy(tx => {
                const txDate = new Date(tx.time * 1000);
                return txDate >= startOfLastWeek && txDate < startOfWeek;
            });
            for (const tx of newTxs) {
                if (tx.amount > 0) {
                    const donorName = tx.description || 'Анонім';
                    if (!this.state.donors[donorName]) {
                        this.state.donors[donorName] = [];
                    }
                    this.state.donors[donorName].push({
                        amount: tx.amount / 100,
                        date: new Date(tx.time * 1000).toLocaleString('uk-UA'),
                    });
                    const donorTxs = this.state.donors[donorName];
                    const donorCount = donorTxs.length;
                    const donorTotal = donorTxs.reduce((sum, t) => sum + t.amount, 0);
                    const messageLines = [
                        '💸 *Поповнення банки*',
                        tx.description ? `👤 ${tx.description}` : '',
                        `💰 Сума: ${tx.amount / 100} ₴`,
                        `💎 Всього задонатив: ${donorTotal.toFixed(2)} ₴`,
                        `🕒 Час: ${new Date(tx.time * 1000).toLocaleString('uk-UA')}`,
                        tx.comment ? `✍️ Коментар: ${tx.comment}` : '',
                    ];
                    if (donorCount >= 2) {
                        messageLines.push('');
                        messageLines.push(`🌟 *Повторний донатер!*`);
                        messageLines.push(`🔢 Кількість донатів: ${donorCount}`);
                        messageLines.push('📋 Історія донатів:');
                        donorTxs.forEach((t, index) => {
                            messageLines.push(`  ${index + 1}. ${t.amount.toFixed(2)} ₴ - ${t.date}`);
                        });
                    }
                    messageLines.push('');
                    messageLines.push(`📅 За місяць: ${totalMonth.toFixed(2)} ₴`);
                    messageLines.push(`📆 За цей тиждень: ${totalWeek.toFixed(2)} ₴`);
                    messageLines.push(`📊 За минулий тиждень: ${totalLastWeek.toFixed(2)} ₴`);
                    const message = messageLines.filter(Boolean).join('\n');
                    await this.sendWithRetry(message);
                    this.state.lastTxnId = tx.id;
                    this.saveState();
                }
            }
        }
        catch (err) {
            console.error('Монобанк помилка:', err.response?.data || err.message);
        }
        finally {
            this.isProcessing = false;
        }
    }
    skipUntilLastId(transactions, lastId) {
        const index = transactions.findIndex(tx => tx.id === lastId);
        return index >= 0 ? transactions.slice(index + 1) : transactions;
    }
    async sendWithRetry(message) {
        try {
            await this.telegram.sendMessage(message);
        }
        catch (err) {
            const error = err.response?.data;
            if (error?.error_code === 429 && error.parameters?.retry_after) {
                const delaySec = error.parameters.retry_after;
                console.warn(`⏳ Rate limit Telegram. Чекаємо ${delaySec} сек...`);
                await new Promise(res => setTimeout(res, delaySec * 1000));
                await this.telegram.sendMessage(message);
            }
            else {
                console.error('❌ Telegram помилка:', error || err.message);
            }
        }
    }
    loadState() {
        try {
            const content = fs.readFileSync(this.stateFilePath, 'utf-8');
            const state = JSON.parse(content);
            if (!state.donors) {
                state.donors = {};
            }
            return state;
        }
        catch {
            return { lastTxnId: null, donors: {} };
        }
    }
    saveState() {
        try {
            fs.writeFileSync(this.stateFilePath, JSON.stringify(this.state, null, 2), 'utf-8');
        }
        catch (err) {
            console.error('❌ Не вдалося зберегти lastTxnId:', err.message);
        }
    }
};
exports.MonobankJarService = MonobankJarService;
exports.MonobankJarService = MonobankJarService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [telegram_service_1.TelegramService])
], MonobankJarService);
//# sourceMappingURL=monobank-jar.service.js.map