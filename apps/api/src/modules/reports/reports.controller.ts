import { Controller, Get } from "@nestjs/common";
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

  @Get("production")
  @Authorize({ module: "reports", action: "read", entitlement: "module.reports" })
  production() {
    return this.reports.production();
  }

  @Get("claims")
  @Authorize({ module: "reports", action: "read", entitlement: "module.reports" })
  claims() {
    return this.reports.claims();
  }

  @Get("regulatory")
  @Authorize({ module: "reports", action: "read", entitlement: "module.reports" })
  regulatory() {
    return this.reports.regulatory();
  }

  @Get("catalog")
  @Authorize({ module: "reports", action: "read", entitlement: "module.reports" })
  catalog() {
    return this.reports.catalog();
  }
}
