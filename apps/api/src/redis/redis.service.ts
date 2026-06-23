import { Injectable, OnModuleDestroy, Logger } from "@nestjs/common";
import Redis from "ioredis";

/**
 * عميل Redis (الكاش/الطوابير). يُستخدم لاحقاً مع BullMQ للتذكيرات والمهام.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor() {
    const url = process.env.REDIS_URL ?? "redis://localhost:6379";
    this.client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });
    this.client.on("error", (err) => this.logger.warn(`Redis: ${err.message}`));
  }

  async ping(): Promise<boolean> {
    try {
      if (this.client.status === "wait" || this.client.status === "end") {
        await this.client.connect();
      }
      const res = await this.client.ping();
      return res === "PONG";
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.client.disconnect();
  }
}
