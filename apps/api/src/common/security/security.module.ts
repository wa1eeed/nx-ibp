import { Global, Module } from "@nestjs/common";
import { RateLimitService } from "./rate-limit.service";

/** خدمات الأمن الأفقية (حماية القوّة الغاشمة) — عامّة لكل الوحدات. */
@Global()
@Module({
  providers: [RateLimitService],
  exports: [RateLimitService],
})
export class SecurityModule {}
