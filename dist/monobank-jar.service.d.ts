import { TelegramService } from './telegram.service';
export declare class MonobankJarService {
    private readonly telegram;
    private token;
    private jarId;
    private lastTxnTime;
    constructor(telegram: TelegramService);
    startChecking(): void;
    private checkJarTransactions;
    private extractSender;
}
