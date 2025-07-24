import { Injectable, OnModuleInit } from '@nestjs/common';
import axios from 'axios';
import { TelegramService } from './telegram.service';
import * as fs from 'fs';
import * as path from 'path';

interface State {
  lastTxnId: string | null;
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
    setInterval(() => this.checkJarTransactions(), 60000); // кожні 60 секунд
  }

  private async checkJarTransactions() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    const now = Math.floor(Date.now() / 1000);
    const since = now - 3600; // остання година
    const url = `https://api.monobank.ua/personal/statement/${this.jarId}/${since}/${now}`;

    try {
      const res = await axios.get(url, {
        headers: { 'X-Token': this.token },
      });

      const transactions = (res.data as any[]).reverse(); // від старих до нових

      const newTxs = this.state.lastTxnId
        ? this.skipUntilLastId(transactions, this.state.lastTxnId)
        : transactions;

      for (const tx of newTxs) {
        if (tx.amount > 0) {
          const message = [
            '💸 *Поповнення банки*',
            tx.description ? `👤 ${tx.description}` : '',
            `💰 Сума: ${tx.amount / 100} ₴`,
            `🕒 Час: ${new Date(tx.time * 1000).toLocaleString('uk-UA')}`,
            tx.comment ? `✍️ Коментар: ${tx.comment}` : '',
          ]
            .filter(Boolean)
            .join('\n');

          await this.sendWithRetry(message);
        }
      }

      if (newTxs.length > 0) {
        this.state.lastTxnId = newTxs[newTxs.length - 1].id;
        this.saveState();
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
      return JSON.parse(content);
    } catch {
      return { lastTxnId: null };
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
