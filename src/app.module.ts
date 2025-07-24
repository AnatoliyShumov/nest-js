import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { TelegramService } from './telegram.service';
import { MonobankJarService } from './monobank-jar.service';

@Module({
  providers: [AppService, TelegramService, MonobankJarService],
})
export class AppModule {}