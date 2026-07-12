import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { FinanceService } from "./finance.service";
import { RecordReceiptDto } from "./dto/record-receipt.dto";
import { CancelPolicyDto } from "./dto/cancel-policy.dto";
import { SettleInsurerDto } from "./dto/settle-insurer.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

/**
 * المالية (المرحلة 4ب) — موديول finance. الأدوار: المحاسب/مدير مالي، المدير العام.
 */
@Controller("finance")
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  // الاعتماد المالي ⇒ يولّد القيد والإشعار والفاتورة آلياً
  @Authorize({ module: "finance", action: "update", entitlement: "module.finance" })
  @HttpCode(200)
  @Post("policies/:id/approve")
  approve(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Param("id") id: string,
  ) {
    return this.finance.approvePolicy(tenantId, userId, id);
  }

  @Authorize({ module: "finance", action: "read", entitlement: "module.finance" })
  @Get("vouchers")
  vouchers() {
    return this.finance.listVouchers();
  }

  @Authorize({ module: "finance", action: "read", entitlement: "module.finance" })
  @Get("policies/:id/postings")
  postings(@Param("id") id: string) {
    return this.finance.postings(id);
  }

  @Authorize({ module: "finance", action: "read", entitlement: "module.finance" })
  @Get("summary")
  summary() {
    return this.finance.summary();
  }

  @Authorize({ module: "finance", action: "read", entitlement: "module.finance" })
  @Get("overview")
  overview() {
    return this.finance.overview();
  }

  @Authorize({ module: "finance", action: "read", entitlement: "module.finance" })
  @Get("coa")
  coa() {
    return this.finance.coa();
  }

  @Authorize({ module: "finance", action: "read", entitlement: "module.finance" })
  @Get("invoices")
  invoices(@CurrentUser("tenantId") tenantId: string) {
    return this.finance.invoices(tenantId);
  }

  @Authorize({ module: "finance", action: "read", entitlement: "module.finance" })
  @Get("invoices/:id/document")
  invoiceDocument(@CurrentUser("tenantId") tenantId: string, @Param("id") id: string) {
    return this.finance.invoiceDocument(tenantId, id);
  }

  @Authorize({ module: "finance", action: "read", entitlement: "module.finance" })
  @Get("receivables")
  receivables() {
    return this.finance.receivables();
  }

  // سند قبض من العميل مقابل إشعار مدين (RCV) — يُحصّل ويُنقص الذمم
  @Authorize({ module: "finance", action: "create", entitlement: "module.finance" })
  @HttpCode(201)
  @Post("debit-notes/:id/receipt")
  recordReceipt(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Param("id") id: string,
    @Body() dto: RecordReceiptDto,
  ) {
    return this.finance.recordReceipt(tenantId, userId, id, dto);
  }

  // استلام عمولة من المؤمِّن (RCV)
  @Authorize({ module: "finance", action: "create", entitlement: "module.finance" })
  @HttpCode(201)
  @Post("commissions/:id/receipt")
  recordCommissionReceipt(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Param("id") id: string,
    @Body() dto: RecordReceiptDto,
  ) {
    return this.finance.recordCommissionReceipt(tenantId, userId, id, dto);
  }

  // كشف حساب العميل (قيود + مدفوعات + رصيد جارٍ)
  @Authorize({ module: "finance", action: "read", entitlement: "module.finance" })
  @Get("statement/:clientId")
  statement(@Param("clientId") clientId: string) {
    return this.finance.statement(clientId);
  }

  // إلغاء وثيقة مُصدَرة (قسط مُرتجَع نسبةً وتناسبًا + إشعار دائن)
  @Authorize({ module: "finance", action: "update", entitlement: "module.finance" })
  @HttpCode(200)
  @Post("policies/:id/cancel")
  cancel(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Param("id") id: string,
    @Body() dto: CancelPolicyDto,
  ) {
    return this.finance.cancelPolicy(tenantId, userId, id, dto);
  }

  // المستحقّ للمؤمِّنين (أمانات) + أعمار الدَّين والمُسوّى
  @Authorize({ module: "finance", action: "read", entitlement: "module.finance" })
  @Get("payables")
  payables() {
    return this.finance.payables();
  }

  // سند صرف (PYV) لتسوية مستحقّ مؤمِّن
  @Authorize({ module: "finance", action: "create", entitlement: "module.finance" })
  @HttpCode(201)
  @Post("insurers/settle")
  settleInsurer(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Body() dto: SettleInsurerDto,
  ) {
    return this.finance.settleInsurer(tenantId, userId, dto);
  }

  // ميزان المراجعة (تجميع أطراف القيود حسب الحساب)
  @Authorize({ module: "finance", action: "read", entitlement: "module.finance" })
  @Get("trial-balance")
  trialBalance() {
    return this.finance.trialBalance();
  }
}
