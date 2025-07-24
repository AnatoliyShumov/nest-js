import { OnModuleInit } from '@nestjs/common';
import { TelegramService } from './telegram.service';
export declare class MonobankJarService implements OnModuleInit {
    private readonly telegram;
    private token;
    private jarId;
    private readonly stateFilePath;
    private state;
    private isProcessing;
    constructor(telegram: TelegramService);
    onModuleInit(): void;
    startChecking(): void;
    private checkJarTransactions;
    private skipUntilLastId;
    private sendWithRetry;
    private loadState;
    private saveState;
}
