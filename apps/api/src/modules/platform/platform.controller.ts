import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { PlatformService } from "./platform.service";
import { PlatformGuard } from "./platform.guard";
import { MfaCodeDto, PlatformLoginDto, TenantStatusDto, UpdateEntitlementDto } from "./dto/platform.dto";
import { Public } from "../auth/public.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

/**
 * لوحة السوبر أدمن. الدخول عام؛ بقية المسارات تتطلّب PlatformGuard (نطاق منصّة).
 */
@UseGuards(PlatformGuard)
@Controller("platform")
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Public()
  @Post("login")
  login(@Body() dto: PlatformLoginDto) {
    return this.platform.login(dto.email, dto.password, dto.mfaCode);
  }

  // ----- المصادقة الثنائية (MFA) — مطلب SLA/NCA -----
  @Get("mfa/status")
  mfaStatus(@CurrentUser("userId") adminId: string) {
    return this.platform.mfaStatus(adminId);
  }

  @HttpCode(200)
  @Post("mfa/setup")
  setupMfa(@CurrentUser("userId") adminId: string) {
    return this.platform.setupMfa(adminId);
  }

  @HttpCode(200)
  @Post("mfa/enable")
  enableMfa(@CurrentUser("userId") adminId: string, @Body() dto: MfaCodeDto) {
    return this.platform.enableMfa(adminId, dto.code);
  }

  @HttpCode(200)
  @Post("mfa/disable")
  disableMfa(@CurrentUser("userId") adminId: string, @Body() dto: MfaCodeDto) {
    return this.platform.disableMfa(adminId, dto.code);
  }

  @Get("tenants")
  tenants() {
    return this.platform.tenants();
  }

  @Get("tenants/:id")
  tenant(@Param("id") id: string) {
    return this.platform.tenant(id);
  }

  @HttpCode(200)
  @Post("tenants/:id/status")
  setStatus(@CurrentUser("userId") adminId: string, @Param("id") id: string, @Body() dto: TenantStatusDto) {
    return this.platform.setStatus(adminId, id, dto);
  }

  @Get("plans")
  plans() {
    return this.platform.plans();
  }

  @HttpCode(200)
  @Post("plans/:code/entitlements")
  updateEntitlement(@Param("code") code: string, @Body() dto: UpdateEntitlementDto) {
    return this.platform.updateEntitlement(code, dto);
  }

  @Get("usage")
  usage() {
    return this.platform.usage();
  }
}
