import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import type { Request } from "express";
import { RedisService } from "../../redis/redis.service";

const MAX = Number(process.env.THROTTLE_MAX ?? 600); // أقصى طلبات لكل IP ضمن النافذة
const WINDOW = Number(process.env.THROTTLE_WINDOW_SEC ?? 60); // ثانية
// مُعطَّل في الاختبار (jest يضبط NODE_ENV=test) أو عند THROTTLE_MAX<=0
const DISABLED = process.env.NODE_ENV === "test" || MAX <= 0;
// الفحص الصحّي وwebhooks المزوّدين لا تُخنق (فحوص مراقبة + استدعاءات server-to-server)
const SKIP_PREFIXES = ["/health", "/billing/webhook"];

/**
 * تحديد معدّل عام لكل IP (Redis، موزَّع عبر النسخ) — طبقة إضافية فوق حماية القوّة
 * الغاشمة لتسجيل الدخول (RateLimitService). نافذة ثابتة INCR+EXPIRE؛ **fail-open**
 * (خلل Redis لا يُعطّل الـ API). يعمل أولًا (قبل المصادقة) فيحمي المسارات العامة أيضًا.
 * يعتمد على `trust proxy` في main.ts ليكون `req.ip` هو عنوان العميل الحقيقي خلف الوكيل.
 */
@Injectable()
export class ThrottleGuard implements CanActivate {
  private readonly logger = new Logger(ThrottleGuard.name);
  constructor(private readonly redis: RedisService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (DISABLED) return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    const path = req.path || req.url || "";
    if (SKIP_PREFIXES.some((p) => path.startsWith(p))) return true;

    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    const key = `throttle:${ip}`;
    try {
      const n = await this.redis.client.incr(key);
      if (n === 1) await this.redis.client.expire(key, WINDOW);
      if (n > MAX) {
        const ttl = await this.redis.client.ttl(key);
        throw new HttpException(
          { message: "طلبات كثيرة — حاول لاحقاً", retryAfterSec: ttl > 0 ? ttl : WINDOW },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      return true;
    } catch (e) {
      if (e instanceof HttpException) throw e;
      // fail-open: لا نُسقِط الـ API بسبب خلل في Redis
      this.logger.warn(`throttle bypass (redis error): ${String(e)}`);
      return true;
    }
  }
}
