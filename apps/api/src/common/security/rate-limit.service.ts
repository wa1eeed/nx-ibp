import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { RedisService } from "../../redis/redis.service";

const MAX_FAILURES = Number(process.env.LOGIN_MAX_FAILURES ?? 8);
const WINDOW_SEC = Number(process.env.LOGIN_LOCK_WINDOW_SEC ?? 900); // 15 دقيقة

/**
 * حماية القوّة الغاشمة (Brute-force) عبر Redis — عدّ المحاولات الفاشلة لكل مفتاح
 * (بريد/IP) ضمن نافذة زمنية، وقفل مؤقّت عند تجاوز الحد. النجاح يُصفّر العدّاد
 * (لا يضرّ بالاستخدام المشروع). موزَّع عبر كل النسخ (Redis) — مناسب للإنتاج.
 */
@Injectable()
export class RateLimitService {
  constructor(private readonly redis: RedisService) {}

  private key(scope: string, id: string): string {
    return `rl:${scope}:${id.toLowerCase()}`;
  }

  /** يرفض الطلب بـ 429 إذا تجاوز المفتاح حدّ المحاولات الفاشلة. */
  async assertNotLocked(scope: string, id: string): Promise<void> {
    const count = Number((await this.redis.client.get(this.key(scope, id))) ?? 0);
    if (count >= MAX_FAILURES) {
      const ttl = await this.redis.client.ttl(this.key(scope, id));
      throw new HttpException(
        { message: "محاولات كثيرة — حاول لاحقاً", retryAfterSec: ttl > 0 ? ttl : WINDOW_SEC },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** يسجّل محاولة فاشلة (يضبط TTL النافذة عند أول فشل). */
  async recordFailure(scope: string, id: string): Promise<void> {
    const k = this.key(scope, id);
    const n = await this.redis.client.incr(k);
    if (n === 1) await this.redis.client.expire(k, WINDOW_SEC);
  }

  /** يُصفّر العدّاد عند النجاح. */
  async clear(scope: string, id: string): Promise<void> {
    await this.redis.client.del(this.key(scope, id));
  }
}
