import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { FinanceService } from "./finance.service";
import { RecordReceiptDto } from "./dto/record-receipt.dto";
import { CancelPolicyDto } from "./dto/cancel-policy.dto";
import { SettleInsurerDto } from "./dto/settle-insurer.dto";
import { CreateJournalDto } from "./dto/create-journal.dto";
import { SettleCommissionDto } from "./dto/settle-commission.dto";
import { CreateInstallmentPlanDto } from "./dto/installments.dto";
import { RefundCreditNoteDto } from "./dto/refund-credit-note.dto";
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

  // ——— القيود اليدوية والمصروفات (المحاسبة العامة) ———
  @Authorize({ module: "finance", action: "read", entitlement: "module.finance" })
  @Get("posting-accounts")
  postingAccounts() {
    return this.finance.postingAccounts();
  }

  @Authorize({ module: "finance", action: "read", entitlement: "module.finance" })
  @Get("journal")
  journal() {
    return this.finance.journalVouchers();
  }

  @Authorize({ module: "finance", action: "create", entitlement: "module.finance" })
  @HttpCode(201)
  @Post("journal")
  createJournal(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Body() dto: CreateJournalDto,
  ) {
    return this.finance.createJournal(tenantId, userId, dto);
  }

  // ——— عمولات الموظفين (مندوبي المبيعات) ———
  @Authorize({ module: "finance", action: "read", entitlement: "module.finance" })
  @Get("employee-commissions")
  employeeCommissions() {
    return this.finance.employeeCommissions();
  }

  @Authorize({ module: "finance", action: "create", entitlement: "module.finance" })
  @HttpCode(201)
  @Post("employee-commissions/:userId/settle")
  settleEmployeeCommission(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") actorId: string,
    @Param("userId") salespersonId: string,
    @Body() dto: SettleCommissionDto,
  ) {
    return this.finance.settleEmployeeCommission(tenantId, actorId, salespersonId, dto);
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

  // مستند سند مطبوع (قبض/صرف/يومية) — §1.7
  @Authorize({ module: "finance", action: "read", entitlement: "module.finance" })
  @Get("vouchers/:id/document")
  voucherDocument(@CurrentUser("tenantId") tenantId: string, @Param("id") id: string) {
    return this.finance.voucherDocument(tenantId, id);
  }

  // الإشعارات الدائنة على العملاء (CNP) + حالة الصرف — §1.7
  @Authorize({ module: "finance", action: "read", entitlement: "module.finance" })
  @Get("credit-notes")
  creditNotes() {
    return this.finance.creditNotes();
  }

  // صرف مرتجع فعلي للعميل مقابل إشعار دائن (CNP) — §1.7
  @Authorize({ module: "finance", action: "create", entitlement: "module.finance" })
  @HttpCode(201)
  @Post("credit-notes/:id/refund")
  refundCreditNote(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Param("id") id: string, @Body() dto: RefundCreditNoteDto) {
    return this.finance.refundCreditNote(tenantId, userId, id, dto);
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

  // متابعة الأقساط عبر كل الإشعارات (متأخّرة/قريبة/قادمة)
  @Authorize({ module: "finance", action: "read", entitlement: "module.finance" })
  @Get("installments/tracking")
  installmentsTracking() {
    return this.finance.installmentsTracking();
  }

  // خطة تقسيط إشعار مدين — عرض/إنشاء/تعديل
  @Authorize({ module: "finance", action: "read", entitlement: "module.finance" })
  @Get("debit-notes/:id/installments")
  installments(@Param("id") id: string) {
    return this.finance.installments(id);
  }

  @Authorize({ module: "finance", action: "create", entitlement: "module.finance" })
  @HttpCode(201)
  @Post("debit-notes/:id/installments")
  createInstallments(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Param("id") id: string,
    @Body() dto: CreateInstallmentPlanDto,
  ) {
    return this.finance.generateInstallments(tenantId, userId, id, dto);
  }

  @Authorize({ module: "finance", action: "update", entitlement: "module.finance" })
  @Put("debit-notes/:id/installments")
  replaceInstallments(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Param("id") id: string,
    @Body() dto: CreateInstallmentPlanDto,
  ) {
    return this.finance.replaceInstallments(tenantId, userId, id, dto);
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

  // الميزانية العمومية (بيان المركز المالي) — أصول = خصوم + حقوق ملكية + صافي الدخل
  @Authorize({ module: "finance", action: "read", entitlement: "module.finance" })
  @Get("balance-sheet")
  balanceSheet() {
    return this.finance.balanceSheet();
  }

  // دفتر الأستاذ (كشف حركة حساب برصيد جارٍ)
  @Authorize({ module: "finance", action: "read", entitlement: "module.finance" })
  @Get("ledger/:account")
  ledger(@Param("account") account: string) {
    return this.finance.ledger(account);
  }

  // إقرار ضريبة القيمة المضافة عن فترة (المخرجات − المدخلات = صافي المستحق)
  @Authorize({ module: "finance", action: "read", entitlement: "module.finance" })
  @Get("vat-return")
  vatReturn(@Query("from") from?: string, @Query("to") to?: string) {
    return this.finance.vatReturn(from, to);
  }

  // بيان التدفّق النقدي (الطريقة المباشرة) — تشغيلي/استثماري/تمويلي عن فترة
  @Authorize({ module: "finance", action: "read", entitlement: "module.finance" })
  @Get("cash-flow")
  cashFlow(@Query("from") from?: string, @Query("to") to?: string) {
    return this.finance.cashFlow(from, to);
  }
}
