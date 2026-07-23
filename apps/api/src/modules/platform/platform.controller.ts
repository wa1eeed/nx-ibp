import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { PlatformService } from "./platform.service";
import { PlatformGuard } from "./platform.guard";
import { PlatformPaymentSettingsService } from "./platform-payment-settings.service";
import { AuditViewService } from "../audit/audit-view.service";
import { NotificationsService } from "../notifications/notifications.service";
import { UpdateNotificationDto } from "../notifications/dto/notification.dto";
import { LeadStatusDto, MfaCodeDto, PlatformLoginDto, TenantStatusDto, UpdateEntitlementDto, UpdatePlanDto } from "./dto/platform.dto";
import { Public } from "../auth/public.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

/**
 * لوحة السوبر أدمن. الدخول عام؛ بقية المسارات تتطلّب PlatformGuard (نطاق منصّة).
 */
@UseGuards(PlatformGuard)
@Controller("platform")
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly notifications: NotificationsService,
    private readonly auditView: AuditViewService,
    private readonly platformPay: PlatformPaymentSettingsService,
  ) {}

  // ----- بوّابة دفع المنصّة (Tap لاشتراكات الوسطاء) — test/live -----
  @Get("payment")
  paymentSettings() {
    return this.platformPay.get();
  }

  @Put("payment")
  savePayment(@CurrentUser("userId") adminId: string, @Body() dto: Record<string, unknown>) {
    return this.platformPay.save(adminId, dto as never);
  }

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

  /** الدخول كالحساب (انتحال) — يُصدر توكن مستأجر موسومًا للعودة، ويُسجَّل في التدقيق. */
  @HttpCode(200)
  @Post("tenants/:id/impersonate")
  impersonate(@CurrentUser("userId") adminId: string, @Param("id") id: string) {
    return this.platform.impersonate(adminId, id);
  }

  @Get("plans")
  plans() {
    return this.platform.plans();
  }

  // تعديل إعدادات الباقة (أهمّها حدّ المستخدمين seatLimit)
  @Put("plans/:code")
  updatePlan(@Param("code") code: string, @CurrentUser("userId") adminId: string, @Body() dto: UpdatePlanDto) {
    return this.platform.updatePlan(code, dto, adminId);
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

  // ----- طلبات التواصل مع المبيعات (Leads) -----
  @Get("leads")
  leads() {
    return this.platform.leads();
  }

  @HttpCode(200)
  @Post("leads/:id/status")
  updateLeadStatus(@CurrentUser("userId") adminId: string, @Param("id") id: string, @Body() dto: LeadStatusDto) {
    return this.platform.updateLeadStatus(id, dto.status, adminId);
  }

  /** مراجعة/تصدير سجل التدقيق عابر المستأجرين — بأسماء المنفّذين (لمفتّشي الهيئة). */
  @Get("audit")
  audit(@Query("tenantId") tenantId?: string, @Query("action") action?: string, @Query("entity") entity?: string, @Query("limit") limit?: string) {
    return this.auditView.listForPlatform({ tenantId, action, entity, limit: limit ? Number(limit) : undefined });
  }

  // ----- إشعارات المنصة الافتراضية (يرثها كل الحسابات ما لم تُخصَّص) -----
  @Get("notifications")
  notifications_(@CurrentUser("userId") adminId: string) {
    void adminId;
    return this.notifications.list(null);
  }

  @HttpCode(200)
  @Put("notifications/:key")
  updateNotification(@CurrentUser("userId") adminId: string, @Param("key") key: string, @Body() dto: UpdateNotificationDto) {
    return this.notifications.update(null, adminId, key, dto);
  }
}
