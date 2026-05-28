import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello() {
    return {
      service: 'fantasy-world-cup-backend',
      status: 'running',
      architecture: 'nest-monolith',
      docs: 'See /api/health and backend module status endpoints.',
    };
  }
}
