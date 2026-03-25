import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello = (): string => {
    return 'Hello, This server is healthy and running!';
  };
}
