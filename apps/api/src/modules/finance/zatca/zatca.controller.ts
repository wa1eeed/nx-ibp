import { Body, Controller, Get, HttpCode, Post, Put } from "@nestjs/common";
import { ZatcaOnboardingService } from "./zatca-onboarding.service";
import { ZatcaBillingService } from "./zatca-billing.service";
import { ZatcaReportingQueue } from "./zatca-reporting.queue";
import { ZatcaConfigDto, ExchangeOtpDto } from "./dto/zatca.dto";
import { Authorize } from "../../rbac/authorize.decorator";
import { CurrentUser } from "../../auth/current-user.decorator";

/**
 * تهيئة ZATCA (Onboarding) + قراءة مستندات الفوترة + تصريف طابور الإبلاغ.
 * التهيئة بصلاحية الإعدادات (إداري المستأجر)؛ قراءة الفوترة بصلاحية المالية.
 */
@Controller("zatca")
export class ZatcaController {
  constructor(
    private readonly onboarding: ZatcaOnboardingService,
    private readonly billing: ZatcaBillingService,
    private readonly queue: ZatcaReportingQueue,
  ) {}

  @Authorize({ module: "settings", action: "read" })
  @Get("config")
  config(@CurrentUser("tenantId") t: string) {
    return this.onboarding.getConfig(t);
  }

  @Authorize({ module: "settings", action: "update" })
  @Put("config")
  upsert(@CurrentUser("tenantId") t: string, @Body() dto: ZatcaConfigDto) {
    return this.onboarding.upsertConfig(t, dto);
  }

  @Authorize({ module: "settings", action: "update" })
  @HttpCode(200)
  @Post("onboard/generate-csr")
  generateCsr(@CurrentUser("tenantId") t: string, @CurrentUser("userId") u: string) {
    return this.onboarding.generateCsr(t, u);
  }

  @Authorize({ module: "settings", action: "update" })
  @HttpCode(200)
  @Post("onboard/exchange-otp")
  exchangeOtp(@CurrentUser("tenantId") t: string, @CurrentUser("userId") u: string, @Body() dto: ExchangeOtpDto) {
    return this.onboarding.exchangeOtp(t, u, dto.otp);
  }

  @Authorize({ module: "settings", action: "update" })
  @HttpCode(200)
  @Post("onboard/run-compliance")
  runCompliance(@CurrentUser("tenantId") t: string, @CurrentUser("userId") u: string) {
    return this.onboarding.runCompliance(t, u);
  }

  @Authorize({ module: "settings", action: "update" })
  @HttpCode(200)
  @Post("onboard/finalize")
  finalize(@CurrentUser("tenantId") t: string, @CurrentUser("userId") u: string) {
    return this.onboarding.finalize(t, u);
  }

  @Authorize({ module: "finance", action: "read", entitlement: "module.finance" })
  @Get("billing-documents")
  billingDocs(@CurrentUser("tenantId") t: string) {
    return this.billing.list(t);
  }

  @Authorize({ module: "finance", action: "update", entitlement: "module.finance" })
  @HttpCode(200)
  @Post("reporting/drain")
  drain() {
    return this.queue.drain();
  }
}
