import { Injectable, OnModuleInit } from '@nestjs/common';
import { MonobankJarService } from './monobank-jar.service';

@Injectable()
export class AppService implements OnModuleInit {
  constructor(private readonly monoService: MonobankJarService) {}

  onModuleInit() {
    this.monoService.startChecking();
  }
}