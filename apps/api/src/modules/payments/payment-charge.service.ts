import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { RequestContextService } from "../../common/request-context/request-context.service";
import { FinanceService } from "../finance/finance.service";
import { PaymentSettingsService } from "./payment-settings.service";
import { makeTenantGateway } from "../billing/gateway/gateway.factory";

const num = (v: unknown) => Number(v ?? 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * دفع العميل الإلكتروني للأقساط/الذمم عبر بوّابة المستأجر (BYO Tap/Moyasar) — §2.2-ب.
 * تدفّق: إنشاء شحنة ⇒ تحويل العميل لصفحة الدفع ⇒ عند العودة/الـwebhook: تحقّق النجاح ⇒
 * **سند قبض (RCV) تلقائي** عبر `recordReceipt` (يُطبّق شلال الأقساط) — بحتمية (لا تكرار سند).
 */
@Injectable()
export class PaymentChargeService {
  private readonly logger = new Logger(PaymentChargeService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PaymentSettingsService,
    private readonly finance: FinanceService,
    private readonly ctx: RequestContextService,
    private readonly audit: AuditService,
  ) {}

  private get apiBase(): string {
    return process.env.API_PUBLIC_URL ?? process.env.NEXT_PUBLIC_API_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`;
  }
  private get webBase(): string {
    return process.env.APP_PUBLIC_URL ?? process.env.CORS_ORIGINS?.split(",")[0]?.trim() ?? "http://localhost:3000";
  }

  /** يبدأ دفع إشعار مدين: يتحقّق من الملكية والمتبقّي، يُنشئ شحنة، ويعيد رابط الدفع. */
  async createCharge(tenantId: string, clientId: string, dto: { debitNoteId: string; amount: number }) {
    const note = await this.prisma.debitNote.findFirst({ where: { id: dto.debitNoteId, clientId }, select: { id: true, sequenceNo: true, netAmount: true, vatAmount: true, settledAmount: true } });
    if (!note) throw new NotFoundException("إشعار المدين غير موجود");
    const outstanding = r2(num(note.netAmount) + num(note.vatAmount) - num(note.settledAmount));
    const amount = r2(dto.amount);
    if (amount <= 0 || amount > outstanding + 0.01) throw new BadRequestException(`المبلغ يتجاوز المتبقّي المستحقّ (${outstanding})`);

    const gw = await this.settings.activeGateway(tenantId);
    if (!gw) throw new BadRequestException("الدفع الإلكتروني غير مُفعَّل لدى شركة الوساطة");
    const gateway = makeTenantGateway(gw.provider, gw.secretKey);
    const client = await this.prisma.client.findFirst({ where: { id: clientId }, select: { name: true, email: true } });

    const payment = await this.prisma.portalPayment.create({ data: { tenantId, clientId, debitNoteId: note.id, amount, currency: gw.currency, gateway: gateway.name, status: "PENDING" }, select: { id: true } });
    const charge = await gateway.createCharge({
      amount,
      currency: gw.currency,
      description: `دفع إشعار ${note.sequenceNo ?? note.id}`,
      customerName: client?.name ?? "عميل",
      customerEmail: client?.email ?? "client@portal.local",
      redirectUrl: `${this.webBase}/portal/pay/return?payment=${payment.id}`,
      webhookUrl: `${this.apiBase}/payments/webhook`,
      reference: payment.id,
      metadata: { tenantId, debitNoteId: note.id },
    });
    await this.prisma.portalPayment.update({ where: { id: payment.id }, data: { gatewayChargeId: charge.chargeId, redirectUrl: charge.redirectUrl } });
    await this.audit.log({ tenantId, userId: "portal", action: "create", entity: "portal_payment", entityId: payment.id, meta: { debitNoteId: note.id, amount, gateway: gateway.name } });
    return { paymentId: payment.id, redirectUrl: charge.redirectUrl, amount, currency: gw.currency, status: "PENDING" };
  }

  /** يطابق حالة الدفع بعد عودة العميل، ويُنشئ سند القبض عند النجاح. */
  async confirm(tenantId: string, clientId: string, paymentId: string) {
    const payment = await this.prisma.portalPayment.findFirst({ where: { id: paymentId, clientId } });
    if (!payment) throw new NotFoundException("عملية الدفع غير موجودة");
    if (payment.status === "PAID") return { status: "PAID", paymentId };
    if (!payment.gatewayChargeId) throw new BadRequestException("لا توجد شحنة مرتبطة");
    const gw = await this.settings.activeGateway(tenantId);
    if (!gw) throw new BadRequestException("الدفع غير مُفعَّل");
    const gateway = makeTenantGateway(gw.provider, gw.secretKey);
    const charge = await gateway.retrieveCharge(payment.gatewayChargeId);
    if (charge.paid) {
      await this.settle(payment);
      return { status: "PAID", paymentId };
    }
    const failed = charge.status === "FAILED" || charge.status === "DECLINED";
    await this.prisma.portalPayment.update({ where: { id: payment.id }, data: { status: failed ? "FAILED" : "PENDING" } });
    return { status: failed ? "FAILED" : "PENDING", paymentId };
  }

  /** نقطة الـ webhook (عامة، بلا سياق مستأجر) — تُحقّق التوقيع بمفتاح المستأجر ثم تُسجّل السند. */
  async handleWebhook(headers: Record<string, string | undefined>, body: Record<string, unknown>) {
    const data = (body.data as Record<string, unknown> | undefined) ?? body;
    const chargeId = String(data.id ?? body.id ?? "");
    if (!chargeId) return { ok: true };
    const payment = await this.ctx.run({}, () => this.prisma.portalPayment.findFirst({ where: { gatewayChargeId: chargeId } }));
    if (!payment || payment.status === "PAID") return { ok: true };
    const gw = await this.ctx.run({}, () => this.settings.activeGateway(payment.tenantId));
    if (!gw) return { ok: true };
    const gateway = makeTenantGateway(gw.provider, gw.secretKey);
    const result = gateway.verifyWebhook(headers, body);
    if (!result.valid) throw new ConflictException("توقيع الـwebhook غير صالح");
    if (result.paid) await this.ctx.run({}, () => this.settle(payment));
    return { ok: true };
  }

  /** يُسجّل سند القبض (شلال الأقساط) ويعلّم العملية مدفوعة — حتمي (يتخطّى المُسجَّل). */
  private async settle(payment: { id: string; tenantId: string; debitNoteId: string; amount: unknown; status: string }) {
    if (payment.status === "PAID") return;
    const receipt = await this.finance.recordReceipt(payment.tenantId, "portal", payment.debitNoteId, {
      amount: num(payment.amount),
      method: "card",
      reference: `pay:${payment.id}`,
    });
    await this.prisma.portalPayment.update({ where: { id: payment.id }, data: { status: "PAID", receiptVoucherId: receipt.voucher.id } });
    await this.audit.log({ tenantId: payment.tenantId, userId: "portal", action: "update", entity: "portal_payment", entityId: payment.id, meta: { paid: true, debitNoteId: payment.debitNoteId, receipt: receipt.voucher.sequenceNo } });
  }
}
