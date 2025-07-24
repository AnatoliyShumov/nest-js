import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { TelegramService } from './telegram.service';

@Injectable()
export class MonobankJarService {
  private token = process.env.MONOBANK_TOKEN;
  private jarId = process.env.MONOBANK_JAR_ID;
  private lastTxnTime = Math.floor(Date.now() / 1000) - 86400;

  constructor(private readonly telegram: TelegramService) {}

  startChecking() {
    setInterval(() => this.checkJarTransactions(), 60000); // кожні 60 секунд
  }

  private async checkJarTransactions() {
    const now = Math.floor(Date.now() / 1000);
    const url = `https://api.monobank.ua/personal/statement/${this.jarId}/${this.lastTxnTime}/${now}`;

    try {
      const res = await axios.get(url, {
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
    } catch (err) {
      console.error('Монобанк помилка:', err.response?.data || err.message);
    }
  }

  private extractSender(description: string): string | null {
    const match = description?.match(/^Від: (.+)$/);
    return match ? match[1] : null;
  }
}
