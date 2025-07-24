import { OnModuleInit } from '@nestjs/common';
import { MonobankJarService } from './monobank-jar.service';
export declare class AppService implements OnModuleInit {
    private readonly monoService;
    constructor(monoService: MonobankJarService);
    onModuleInit(): void;
}
