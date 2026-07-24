import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnApplicationShutdown {
  async onModuleInit() { await this.$connect(); }
  // Password-reset deliveries drain in beforeApplicationShutdown. Disconnecting
  // in the final lifecycle phase keeps their challenge invalidation queries safe.
  async onApplicationShutdown() { await this.$disconnect(); }
}
