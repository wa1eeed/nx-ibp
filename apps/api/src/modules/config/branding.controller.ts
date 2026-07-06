import { Controller, Get, NotFoundException, Param, Res } from "@nestjs/common";
import type { Response } from "express";
import { ConfigService } from "./config.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { Public } from "../auth/public.decorator";

/**
 * الهوية البصرية للمستأجر (White-label — P0-B):
 *  - GET /branding: قراءة هوية المستأجر الحالي (أي مستخدم مصادَق) لتلوين الواجهة.
 *  - GET /branding/:tenantId/logo: خدمة الشعار عبر رابط **عام ثابت** (يظهر في البريد
 *    الذي يصل لعملاء خارجيين — الشعار ليس سرًّا).
 */
@Controller("branding")
export class BrandingController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  mine(@CurrentUser("tenantId") tenantId: string) {
    return this.config.getBranding(tenantId);
  }

  @Public()
  @Get(":tenantId/logo")
  async logo(@Param("tenantId") tenantId: string, @Res() res: Response) {
    const asset = await this.config.getLogo(tenantId);
    if (!asset) throw new NotFoundException("لا شعار");
    res.setHeader("Content-Type", asset.mime);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(asset.data);
  }
}
