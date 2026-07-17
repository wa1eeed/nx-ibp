import { Controller, Get, Query } from "@nestjs/common";
import { ReportsService } from "./reports.service";
import { Authorize } from "../rbac/authorize.decorator";

/**
 * التقارير والتحليلات — على مستوى المستأجر.
 * - لوحة التحكّم: صلاحية `dashboard:read` (موديول أساسي، بلا entitlement).
 * - العمولات: صلاحية المالية (موديول أساسي مشمول بكل الباقات).
 * - تحليلات/تقارير: صلاحية `reports:read` + entitlement `module.reports` (موديول مدفوع).
 */
@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("dashboard")
  @Authorize({ module: "dashboard", action: "read" })
  dashboard() {
    return this.reports.dashboard();
  }

  @Get("commissions")
  @Authorize({ module: "finance", action: "read", entitlement: "module.finance" })
  commissions() {
    return this.reports.commissions();
  }

  // التحليلات المتقدمة — ميزة premium (feature.analytics)
  @Get("production")
  @Authorize({ module: "reports", action: "read", entitlement: "feature.analytics" })
  production() {
    return this.reports.production();
  }

  @Get("claims")
  @Authorize({ module: "reports", action: "read", entitlement: "feature.analytics" })
  claims() {
    return this.reports.claims();
  }

  // تقرير هيئة التأمين — أساسي (متطلّب تنظيمي، يبقى ضمن module.reports)
  @Get("regulatory")
  @Authorize({ module: "reports", action: "read", entitlement: "module.reports" })
  regulatory() {
    return this.reports.regulatory();
  }

  // كشف المؤمِّن الدوري (Bordereau) — متطلّب تنظيمي/تسوية
  @Get("bordereau")
  @Authorize({ module: "reports", action: "read", entitlement: "module.reports" })
  bordereau(@Query("insurer") insurer?: string, @Query("from") from?: string, @Query("to") to?: string) {
    return this.reports.bordereau(insurer, from, to);
  }

  @Get("catalog")
  @Authorize({ module: "reports", action: "read", entitlement: "module.reports" })
  catalog() {
    return this.reports.catalog();
  }
}
