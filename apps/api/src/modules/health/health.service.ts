import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RedisService } from "../../redis/redis.service";

export interface HealthResult {
  status: "ok" | "degraded";
  uptimeSec: number;
  timestamp: string;
  checks: {
    database: "up" | "down";
    redis: "up" | "down";
  };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async check(): Promise<HealthResult> {
    const [dbUp, redisUp] = await Promise.all([this.checkDb(), this.redis.ping()]);
    const ok = dbUp && redisUp;
    return {
      status: ok ? "ok" : "degraded",
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      checks: {
        database: dbUp ? "up" : "down",
        redis: redisUp ? "up" : "down",
      },
    };
  }

  private async checkDb(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
