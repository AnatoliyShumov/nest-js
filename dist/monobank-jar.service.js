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
let MonobankJarService = class MonobankJarService {
    constructor(telegram) {
        this.telegram = telegram;
        this.token = process.env.MONOBANK_TOKEN;
        this.jarId = process.env.MONOBANK_JAR_ID;
        this.lastTxnTime = Math.floor(Date.now() / 1000) - 86400;
    }
    startChecking() {
        setInterval(() => this.checkJarTransactions(), 60000);
    }
    async checkJarTransactions() {
        const now = Math.floor(Date.now() / 1000);
        const url = `https://api.monobank.ua/personal/statement/${this.jarId}/${this.lastTxnTime}/${now}`;
        try {
            const res = await axios_1.default.get(url, {
                headers: { 'X-Token': this.token },
            });
            const transactions = res.data;
            for (const tx of transactions) {
                if (tx.amount > 0) {
                    const sender = this.extractSender(tx.description);
                    const message = [
                        '💸 *Поповнення банки*',
                        sender ? `👤 Від: ${sender}` : '',
                        `💰 Сума: ${tx.amount / 100} ₴`,
                        `🕒 Час: ${new Date(tx.time * 1000).toLocaleString('uk-UA')}`,
                        tx.comment ? `✍️ Коментар: ${tx.comment}` : '',
                    ]
                        .filter(Boolean)
                        .join('\n');
                    await this.telegram.sendMessage(message);
                }
            }
            this.lastTxnTime = now;
        }
        catch (err) {
            console.error('Монобанк помилка:', err.response?.data || err.message);
        }
    }
    extractSender(description) {
        const match = description?.match(/^Від: (.+)$/);
        return match ? match[1] : null;
    }
};
exports.MonobankJarService = MonobankJarService;
exports.MonobankJarService = MonobankJarService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [telegram_service_1.TelegramService])
], MonobankJarService);
//# sourceMappingURL=monobank-jar.service.js.map