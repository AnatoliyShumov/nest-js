import { Injectable, OnModuleInit } from '@nestjs/common';

@Injectable()
export class AppService implements OnModuleInit {
  onModuleInit() {
    setInterval(() => {
      console.log('Hello world');
    }, 5000);
  }

  getHello(): string {
    return 'Hello World!';
  }
}