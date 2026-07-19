import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { RequestContextService } from "../../common/request-context/request-context.service";
import { PAYMENT_GATEWAY, type PaymentGateway } from "./gateway/gateway.types";
import { NotificationsService } from "../notifications/notifications.service";
import type { CheckoutDto } from "./dto/checkout.dto";

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly currency = process.env.BILLING_CURRENCY ?? "SAR";

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ctx: RequestContextService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly notifications: NotificationsService,
  ) {}

  private get apiBase(): string {
    return process.env.API_PUBLIC_URL ?? process.env.NEXT_PUBLIC_API_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`;
  }
  private get webBase(): string {
    return process.env.APP_PUBLIC_URL ?? process.env.CORS_ORIGINS?.split(",")[0]?.trim() ?? "http://localhost:3000";
  }

  /** يبدأ دفع اشتراك: ينشئ فاتورة PENDING ويُنشئ شحنة لدى البوّابة، ويعيد رابط الدفع. */
  async checkout(tenantId: string, userId: string, dto: CheckoutDto) {
    const cycle = dto.cycle ?? "MONTHLY";
    const plan = await this.prisma.plan.findUnique({ where: { code: dto.planCode } });
    if (!plan) throw new UnprocessableEntityException("باقة غير معروفة");
    // التسعير لكل مستخدم: الإجمالي = سعر المستخدم × عدد المقاعد المشترَك بها
    const seats = (await this.prisma.subscription.findFirst({ where: { tenantId }, select: { seatsUsed: true } }))?.seatsUsed ?? 1;
    const perUser = Number(cycle === "YEARLY" ? plan.priceYearly : plan.priceMonthly);
    const amount = Math.round(perUser * Math.max(1, seats) * 100) / 100;

    const invoice = await this.prisma.subscriptionInvoice.create({
      data: { tenantId, planCode: plan.code, cycle, amount, currency: this.currency, status: "PENDING", gateway: this.gateway.name },
      select: { id: true },
    });

    const charge = await this.gateway.createCharge({
      amount,
      currency: this.currency,
      description: `اشتراك ${plan.name} (${cycle === "YEARLY" ? "سنوي" : "شهري"})`,
      customerName: dto.customerName ?? "Tenant Admin",
      customerEmail: dto.customerEmail ?? "billing@tenant.local",
      redirectUrl: `${this.webBase}/billing/return?invoice=${invoice.id}`,
      webhookUrl: `${this.apiBase}/billing/webhook`,
      reference: invoice.id,
      metadata: { tenantId, planCode: plan.code },
    });

    await this.prisma.subscriptionInvoice.update({
      where: { id: invoice.id },
      data: { gatewayChargeId: charge.chargeId, redirectUrl: charge.redirectUrl },
    });
    await this.audit.log({ tenantId, userId, action: "create", entity: "subscription_invoice", entityId: invoice.id, meta: { plan: plan.code, cycle, amount, gateway: this.gateway.name } });

    return { invoiceId: invoice.id, redirectUrl: charge.redirectUrl, amount, currency: this.currency, status: "PENDING" };
  }

  /** يطابق حالة الدفع من البوّابة (بعد عودة العميل) ويفعّل الاشتراك عند النجاح. */
  async confirm(tenantId: string, userId: string, invoiceId: string) {
    const invoice = await this.prisma.subscriptionInvoice.findFirst({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException("الفاتورة غير موجودة");
    if (invoice.status === "PAID") return { status: "PAID", invoiceId };
    if (!invoice.gatewayChargeId) throw new BadRequestException("لا توجد شحنة مرتبطة");

    const charge = await this.gateway.retrieveCharge(invoice.gatewayChargeId);
    if (charge.paid) {
      await this.activate(invoice.id, tenantId, invoice.planCode, invoice.cycle);
      await this.audit.log({ tenantId, userId, action: "update", entity: "subscription_invoice", entityId: invoice.id, meta: { paid: true, via: "confirm" } });
      return { status: "PAID", invoiceId };
    }
    await this.prisma.subscriptionInvoice.update({ where: { id: invoice.id }, data: { status: charge.status === "FAILED" || charge.status === "DECLINED" ? "FAILED" : "PENDING" } });
    return { status: charge.status, invoiceId };
  }

  /** نقطة الـ webhook (عامة) — تتحقّق من التوقيع ثم تفعّل بلا سياق مستأجر. */
  async handleWebhook(headers: Record<string, string | undefined>, body: Record<string, unknown>) {
    const result = this.gateway.verifyWebhook(headers, body);
    if (!result.valid) throw new ConflictException("توقيع غير صالح");
    if (!result.chargeId) return { ok: true };

    const invoice = await this.prisma.subscriptionInvoice.findFirst({ where: { gatewayChargeId: result.chargeId } });
    if (!invoice) return { ok: true }; // شحنة غير معروفة — نتجاهل بهدوء
    if (result.paid && invoice.status !== "PAID") {
      // عام بلا سياق ⇒ سياق فارغ + tenantId صريح
      await this.ctx.run({}, () => this.activate(invoice.id, invoice.tenantId, invoice.planCode, invoice.cycle));
      await this.audit.log({ tenantId: invoice.tenantId, action: "update", entity: "subscription_invoice", entityId: invoice.id, meta: { paid: true, via: "webhook" } });
    }
    return { ok: true };
  }

  /** يُعلّم الفاتورة مدفوعة ويفعّل الاشتراك (المدّة + الباقة + حالة المستأجر) ذرّياً. */
  private async activate(invoiceId: string, tenantId: string, planCode: string, cycle: "MONTHLY" | "YEARLY") {
    const plan = await this.prisma.plan.findUnique({ where: { code: planCode }, select: { id: true } });
    const now = new Date();
    const renewsAt = new Date(now);
    if (cycle === "YEARLY") renewsAt.setFullYear(renewsAt.getFullYear() + 1);
    else renewsAt.setMonth(renewsAt.getMonth() + 1);

    await this.prisma.$transaction(async (tx) => {
      await tx.subscriptionInvoice.update({ where: { id: invoiceId }, data: { status: "PAID", paidAt: now, periodStart: now, periodEnd: renewsAt } });
      await tx.subscription.updateMany({ where: { tenantId }, data: { ...(plan ? { planId: plan.id } : {}), cycle, renewsAt } });
      await tx.tenant.update({ where: { id: tenantId }, data: { status: "ACTIVE" } });
    });
    this.logger.log(`تفعيل اشتراك المستأجر ${tenantId} (${planCode}/${cycle})`);
    // إشعار إداري بتفعيل/تحديث الاشتراك
    void this.notifications.notifyStaff(tenantId, "staff_subscription_status", { status: `مُفعّل — ${planCode}/${cycle}` }).catch(() => undefined);
  }

  /** كتالوج الباقات للعرض في صفحة الفوترة (Plan جدول عام غير معزول). */
  plans() {
    return this.prisma.plan.findMany({
      orderBy: { priceMonthly: "asc" },
      select: { code: true, name: true, seatLimit: true, priceMonthly: true, priceYearly: true },
    });
  }

  invoices(tenantId: string) {
    return this.prisma.subscriptionInvoice.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: { id: true, planCode: true, cycle: true, amount: true, currency: true, status: true, paidAt: true, createdAt: true },
    });
  }

  async subscription(tenantId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { tenantId },
      select: { cycle: true, seatsUsed: true, startedAt: true, renewsAt: true, plan: { select: { code: true, name: true, seatLimit: true, priceMonthly: true, priceYearly: true, trialDays: true, slaResponseHours: true } } },
    });
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId }, select: { status: true } });
    // نهاية الفترة التجريبية = بداية الاشتراك + أيام التجربة (يُعرَض للعميل ليعرف موعد استحقاق الدفع)
    let trialEndsAt: Date | null = null;
    const trialDays = sub?.plan?.trialDays ?? 0;
    if (sub?.startedAt && trialDays > 0) {
      trialEndsAt = new Date(sub.startedAt);
      trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);
    }
    return { status: tenant?.status, trialEndsAt, subscription: sub };
  }

  /**
   * لقطة المقاعد والاحتساب التناسبي (نموذج «ادفع مقابل المستخدمين الفعليين»).
   * تُقارن المستخدمين النشطين بالمقاعد المغطّاة بآخر فاتورة مدفوعة، وتحسب:
   * - `addUnit`: تكلفة إضافة مستخدم واحد للمدّة المتبقّية من الدورة (احتساب تناسبي).
   * - `pending`: فرق تناسبي مستحقّ (charge) أو دائن (credit) عند تغيّر عدد المستخدمين وسط الدورة.
   * نقل الرخصة (استبدال مغادر بموظف جديد) لا يغيّر العدد ⇒ بلا رسوم؛ والإلغاء (تعطيل بلا بديل) يخفّض التجديد القادم.
   */
  async seats(tenantId: string) {
    const DAY = 24 * 60 * 60 * 1000;
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const now = new Date();

    const sub = await this.prisma.subscription.findFirst({
      where: { tenantId },
      select: { cycle: true, seatsUsed: true, startedAt: true, renewsAt: true, plan: { select: { code: true, name: true, priceMonthly: true, priceYearly: true } } },
    });
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId }, select: { status: true } });
    const activeUsers = await this.prisma.user.count({ where: { tenantId, status: "ACTIVE" } });

    if (!sub || !sub.plan) {
      return { activeUsers, paidSeats: activeUsers, delta: 0, cycle: "MONTHLY", perUser: 0, periodCost: 0, currency: this.currency, daysRemaining: 0, totalDays: 0, addUnit: 0, pendingAmount: 0, pendingKind: "none", planName: null, isTrial: true };
    }

    const cycle = sub.cycle;
    const perUser = Number(cycle === "YEARLY" ? sub.plan.priceYearly : sub.plan.priceMonthly);
    const periodCost = round2(perUser * Math.max(1, activeUsers)); // تكلفة الدورة القادمة بعدد المستخدمين الحالي

    // خطّ الأساس = المقاعد المغطّاة بآخر فاتورة مدفوعة سارية؛ وإلا (تجربة/بلا دفع) = النشطون الآن (لا تناسب)
    const lastPaid = await this.prisma.subscriptionInvoice.findFirst({
      where: { tenantId, status: "PAID" },
      orderBy: { paidAt: "desc" },
      select: { amount: true, cycle: true, planCode: true, periodStart: true, periodEnd: true },
    });
    let paidSeats = activeUsers;
    let periodStart = sub.startedAt;
    let periodEnd = sub.renewsAt;
    const isTrial = tenant?.status === "TRIAL" || !lastPaid;

    if (lastPaid?.periodEnd && lastPaid.periodEnd > now && lastPaid.periodStart) {
      const paidPlan = await this.prisma.plan.findUnique({ where: { code: lastPaid.planCode }, select: { priceMonthly: true, priceYearly: true } });
      const paidPerUser = Number(lastPaid.cycle === "YEARLY" ? paidPlan?.priceYearly : paidPlan?.priceMonthly) || perUser;
      paidSeats = paidPerUser > 0 ? Math.max(1, Math.round(Number(lastPaid.amount) / paidPerUser)) : activeUsers;
      periodStart = lastPaid.periodStart;
      periodEnd = lastPaid.periodEnd;
    }

    const totalDays = periodStart && periodEnd ? Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / DAY)) : 30;
    const daysRemaining = periodEnd ? Math.max(0, Math.round((periodEnd.getTime() - now.getTime()) / DAY)) : 0;
    const dailyPerUser = perUser / totalDays;

    const delta = activeUsers - paidSeats; // موجب: مستخدمون مضافون وسط الدورة · سالب: مُلغَون
    const addUnit = round2(dailyPerUser * daysRemaining); // تكلفة مستخدم إضافي واحد للمدّة المتبقّية
    const pendingAmount = isTrial ? 0 : round2(Math.abs(delta) * dailyPerUser * daysRemaining);
    const pendingKind: "charge" | "credit" | "none" = isTrial || delta === 0 ? "none" : delta > 0 ? "charge" : "credit";

    return { activeUsers, paidSeats, delta, cycle, perUser, periodCost, currency: this.currency, periodEnd, daysRemaining, totalDays, addUnit, pendingAmount, pendingKind, planName: sub.plan.name, isTrial };
  }
}
