import { Injectable, OnModuleInit } from '@nestjs/common';
import axios from 'axios';
import { TelegramService } from './telegram.service';
import * as fs from 'fs';
import * as path from 'path';

interface DonorTransaction {
  amount: number;
  date: string;
}

interface State {
  lastTxnId: string | null;
  donors: Record<string, DonorTransaction[]>;
}

@Injectable()
export class MonobankJarService implements OnModuleInit {
  private token = process.env.MONOBANK_TOKEN;
  private jarId = process.env.MONOBANK_JAR_ID;
  private readonly stateFilePath = path.resolve(__dirname, '..', 'last-state.json');
  private state: State = this.loadState();
  private isProcessing = false;

  constructor(private readonly telegram: TelegramService) {}

  onModuleInit() {
    this.startChecking();
  }

  startChecking() {
    setInterval(() => this.checkJarTransactions(), 60000); // кожні 60 сек
  }

  private async checkJarTransactions() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    const now = Math.floor(Date.now() / 1000);
    const since = now - 31 * 86400; // останні 31 день
    const url = `https://api.monobank.ua/personal/statement/${this.jarId}/${since}/${now}`;

    try {
      const res = await axios.get(url, {
        headers: { 'X-Token': this.token },
      });

      const transactions = (res.data as any[]).reverse();

      const newTxs = this.state.lastTxnId
        ? this.skipUntilLastId(transactions, this.state.lastTxnId)
        : transactions;

      const currentMonth = new Date().getMonth();
      const nowDate = new Date();
      const startOfWeek = new Date(nowDate);
      // Понеділок як початок тижня (0=неділя, 1=понеділок, ..., 6=субота)
      const dayOfWeek = nowDate.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      startOfWeek.setDate(nowDate.getDate() - daysToMonday);
      startOfWeek.setHours(0, 0, 0, 0); // початок дня
      const startOfLastWeek = new Date(startOfWeek);
      startOfLastWeek.setDate(startOfWeek.getDate() - 7);

      const sumBy = (filterFn: (tx: any) => boolean) =>
        transactions.filter(tx => tx.amount > 0 && filterFn(tx)).reduce((sum, tx) => sum + tx.amount, 0) / 100;

      const totalMonth = sumBy(tx => new Date(tx.time * 1000).getMonth() === currentMonth);
      const totalWeek = sumBy(tx => new Date(tx.time * 1000) >= startOfWeek);
      const totalLastWeek = sumBy(tx => {
        const txDate = new Date(tx.time * 1000);
        return txDate >= startOfLastWeek && txDate < startOfWeek;
      });

      for (const tx of newTxs) {
        if (tx.amount > 0) {
          // Оновлюємо інформацію про донатера
          const donorName = tx.description || 'Анонім';
          if (!this.state.donors[donorName]) {
            this.state.donors[donorName] = [];
          }
          this.state.donors[donorName].push({
            amount: tx.amount / 100,
            date: new Date(tx.time * 1000).toLocaleString('uk-UA'),
          });

          // Підраховуємо статистику донатера
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

          // Додаємо інформацію про повторні донати
          if (donorCount >= 2) {
            messageLines.push('');
            messageLines.push(`🌟 *Повторний донатер: ${donorName}*`);
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

          // Додаємо рейтинги донатерів
          const topDonors = this.generateTopDonors();
          messageLines.push(...topDonors);

          const message = messageLines.filter(Boolean).join('\n');
          await this.sendWithRetry(message);
          
          // Зберігаємо стан після кожної транзакції
          this.state.lastTxnId = tx.id;
          this.saveState();
        }
      }
    } catch (err) {
      console.error('Монобанк помилка:', err.response?.data || err.message);
    } finally {
      this.isProcessing = false;
    }
  }

  private skipUntilLastId(transactions: any[], lastId: string) {
    const index = transactions.findIndex(tx => tx.id === lastId);
    return index >= 0 ? transactions.slice(index + 1) : transactions;
  }

  private generateTopDonors(): string[] {
    const lines: string[] = [];

    // Формуємо дані для рейтингів
    const donorsData = Object.entries(this.state.donors).map(([name, txs]) => ({
      name,
      total: txs.reduce((sum, t) => sum + t.amount, 0),
      count: txs.length,
    }));

    if (donorsData.length === 0) {
      return lines;
    }

    // Топ-10 за сумою
    const topByAmount = [...donorsData]
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    lines.push('');
    lines.push('🏆 *ТОП-10 ДОНАТЕРІВ ЗА СУМОЮ:*');
    topByAmount.forEach((donor, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      lines.push(`${medal} ${donor.name} - ${donor.total.toFixed(2)} ₴`);
    });

    // Топ-10 за кількістю донатів (тільки ті, хто має більше 1 донату)
    const topByCount = [...donorsData]
      .filter(d => d.count > 1)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    if (topByCount.length > 0) {
      lines.push('');
      lines.push('🎯 *ТОП-10 ЗА КІЛЬКІСТЮ ДОНАТІВ:*');
      topByCount.forEach((donor, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        lines.push(`${medal} ${donor.name} - ${donor.count} донатів (${donor.total.toFixed(2)} ₴)`);
      });
    }

    return lines;
  }

  private async sendWithRetry(message: string) {
    try {
      await this.telegram.sendMessage(message);
    } catch (err: any) {
      const error = err.response?.data;
      if (error?.error_code === 429 && error.parameters?.retry_after) {
        const delaySec = error.parameters.retry_after;
        console.warn(`⏳ Rate limit Telegram. Чекаємо ${delaySec} сек...`);
        await new Promise(res => setTimeout(res, delaySec * 1000));
        await this.telegram.sendMessage(message);
      } else {
        console.error('❌ Telegram помилка:', error || err.message);
      }
    }
  }

  private loadState(): State {
    try {
      const content = fs.readFileSync(this.stateFilePath, 'utf-8');
      const state = JSON.parse(content);
      // Ініціалізуємо donors, якщо його немає
      if (!state.donors) {
        state.donors = {};
      }
      return state;
    } catch {
      return { lastTxnId: null, donors: {} };
    }
  }

  private saveState() {
    try {
      fs.writeFileSync(this.stateFilePath, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (err) {
      console.error('❌ Не вдалося зберегти lastTxnId:', err.message);
    }
  }
}
