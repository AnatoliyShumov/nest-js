import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class TelegramService {
  private token = process.env.TELEGRAM_BOT_TOKEN;
  private chatId = process.env.TELEGRAM_CHAT_ID;

  async sendMessage(text: string): Promise<void> {
    const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
    await axios.post(url, {
      chat_id: this.chatId,
      text,
      parse_mode: 'Markdown'
    });
  }
}