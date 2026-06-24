import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * التقارير والتحليلات (المرحلة 8ج) — تجميعات على مستوى المستأجر.
 * كل الاستعلامات مفلترة تلقائياً بـ tenantId عبر Prisma middleware (يشمل aggregate/groupBy).
 * تغذّي: لوحة التحكّم، تقرير العمولات، تحليلات الإنتاج/المطالبات، وتقرير هيئة التأمين.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private num(d: unknown): number {
    return d == null ? 0 : Number(d);
  }

  /** مؤشّرات لوحة التحكّم — بيانات حقيقية بدل الوهمية. */
  async dashboard() {
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 864e5);
    const in60 = new Date(now.getTime() + 60 * 864e5);

    const [expiring, pendingRequests, pendingPolicies, renewals, commissionAgg, recentPolicies, recentClaims] = await Promise.all([
      this.prisma.policy.count({ where: { status: "ISSUED", endDate: { gte: now, lte: in30 } } }),
      this.prisma.policyRequest.count({ where: { status: { in: ["UNDER_REVIEW", "FINANCE_REVIEW"] } } }),
      this.prisma.policy.count({ where: { status: { in: ["TECHNICAL_REVIEW", "FINANCE_REVIEW"] } } }),
      this.prisma.policy.findMany({ where: { status: "ISSUED", endDate: { gte: now, lte: in60 } }, select: { id: true, sequenceNo: true, totalPremium: true, endDate: true, insurerName: true } }),
      this.prisma.commission.aggregate({ _sum: { amount: true } }),
      this.prisma.policy.findMany({ orderBy: { createdAt: "desc" }, take: 5, select: { id: true, sequenceNo: true, insurerName: true, totalPremium: true, createdAt: true } }),
      this.prisma.claim.findMany({ orderBy: { createdAt: "desc" }, take: 5, select: { id: true, sequenceNo: true, status: true, createdAt: true } }),
    ]);

    const renewalsAmount = renewals.reduce((s, r) => s + this.num(r.totalPremium), 0);

    return {
      kpis: {
        expiring,
        pending: pendingRequests + pendingPolicies,
        renewalsCount: renewals.length,
        renewalsAmount,
        commissions: this.num(commissionAgg._sum.amount),
      },
      renewals: renewals.map((r) => ({ id: r.id, sequenceNo: r.sequenceNo, insurerName: r.insurerName, amount: this.num(r.totalPremium), endDate: r.endDate })),
      recentActivity: [
        ...recentPolicies.map((p) => ({ kind: "policy", ref: p.sequenceNo, amount: this.num(p.totalPremium), at: p.createdAt })),
        ...recentClaims.map((c) => ({ kind: "claim", ref: c.sequenceNo, status: c.status, at: c.createdAt })),
      ].sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 6),
    };
  }

  /** تقرير العمولات: ملخّص (متوقّع/مستلم/مستحقّ/فرق) + الصفوف. */
  async commissions() {
    const rows = await this.prisma.commission.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, insurerName: true, clientName: true, productLine: true, rate: true, amount: true, receivedAmount: true, status: true, periodMonth: true },
    });
    const total = rows.reduce((s, r) => s + this.num(r.amount), 0);
    const received = rows.filter((r) => r.status === "received").reduce((s, r) => s + this.num(r.receivedAmount ?? r.amount), 0);
    const accrued = rows.filter((r) => r.status === "accrued").reduce((s, r) => s + this.num(r.amount), 0);
    const variance = rows.filter((r) => r.status === "variance").reduce((s, r) => s + (this.num(r.amount) - this.num(r.receivedAmount)), 0);
    const receivedPct = total > 0 ? Math.round((received / total) * 100) : 0;
    return { summary: { total, received, accrued, variance, receivedPct }, rows };
  }

  /** تحليلات الإنتاج: إجمالي القسط، حسب الفرع/الشركة، نسبة تحويل العروض، العروض غير المتفق عليها. */
  async production() {
    const [premiumAgg, policyCount, byLine, byInsurer, requestsByStatus] = await Promise.all([
      this.prisma.policy.aggregate({ where: { status: "ISSUED" }, _sum: { premium: true, vat: true, totalPremium: true, commissionAmount: true } }),
      this.prisma.policy.count({ where: { status: "ISSUED" } }),
      this.prisma.policy.groupBy({ by: ["productLineCode"], where: { status: "ISSUED" }, _sum: { totalPremium: true }, _count: true }),
      this.prisma.policy.groupBy({ by: ["insurerName"], where: { status: "ISSUED" }, _sum: { totalPremium: true }, _count: true }),
      this.prisma.policyRequest.groupBy({ by: ["status"], _count: true }),
    ]);

    const statusMap = Object.fromEntries(requestsByStatus.map((r) => [r.status, r._count]));
    const awarded = (statusMap.AWARDED ?? 0) + (statusMap.ISSUED ?? 0) + (statusMap.APPROVED ?? 0);
    const totalReq = requestsByStatus.reduce((s, r) => s + r._count, 0);
    const nonAwarded = (statusMap.QUOTING ?? 0) + (statusMap.DRAFT ?? 0);

    return {
      totalGwp: this.num(premiumAgg._sum.totalPremium),
      netPremium: this.num(premiumAgg._sum.premium),
      vat: this.num(premiumAgg._sum.vat),
      commission: this.num(premiumAgg._sum.commissionAmount),
      policyCount,
      conversionRate: totalReq > 0 ? Math.round((awarded / totalReq) * 100) : 0,
      nonAwardedQuotes: nonAwarded,
      byLine: byLine.map((l) => ({ line: l.productLineCode ?? "—", premium: this.num(l._sum.totalPremium), count: l._count })).sort((a, b) => b.premium - a.premium),
      byInsurer: byInsurer.map((i) => ({ insurer: i.insurerName ?? "—", premium: this.num(i._sum.totalPremium), count: i._count })).sort((a, b) => b.premium - a.premium),
    };
  }

  /** تحليلات المطالبات: حسب الحالة، الإجمالي المطالَب/المُسوّى، نسبة الخسارة التقريبية. */
  async claims() {
    const [byStatus, agg, premiumAgg] = await Promise.all([
      this.prisma.claim.groupBy({ by: ["status"], _count: true }),
      this.prisma.claim.aggregate({ _sum: { claimedAmount: true, settledAmount: true } }),
      this.prisma.policy.aggregate({ where: { status: "ISSUED" }, _sum: { premium: true } }),
    ]);
    const claimed = this.num(agg._sum.claimedAmount);
    const settled = this.num(agg._sum.settledAmount);
    const netPremium = this.num(premiumAgg._sum.premium);
    return {
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count })),
      totalClaimed: claimed,
      totalSettled: settled,
      lossRatio: netPremium > 0 ? Math.round((settled / netPremium) * 1000) / 10 : 0,
    };
  }

  /** تقرير هيئة التأمين — تجميعات قياسية (إجمالي القسط المكتتب، العمولات، المطالبات، حسب فئة المنتج). */
  async regulatory() {
    const [gwp, commission, claims, byClass] = await Promise.all([
      this.prisma.policy.aggregate({ where: { status: "ISSUED" }, _sum: { premium: true, vat: true, totalPremium: true } }),
      this.prisma.commission.aggregate({ _sum: { amount: true } }),
      this.prisma.claim.aggregate({ _sum: { claimedAmount: true, settledAmount: true }, _count: true }),
      this.prisma.policy.groupBy({ by: ["productLineCode"], where: { status: "ISSUED" }, _sum: { totalPremium: true }, _count: true }),
    ]);
    return {
      grossWrittenPremium: this.num(gwp._sum.totalPremium),
      netPremium: this.num(gwp._sum.premium),
      vat: this.num(gwp._sum.vat),
      brokerageCommission: this.num(commission._sum.amount),
      claimsCount: claims._count,
      claimsSettled: this.num(claims._sum.settledAmount),
      byProductLine: byClass.map((c) => ({ line: c.productLineCode ?? "—", premium: this.num(c._sum.totalPremium), count: c._count })),
    };
  }

  /** كتالوج التقارير الـ12 المنصوص عليها (BLUEPRINT §3.8) — وصفية للواجهة. */
  catalog() {
    return [
      { key: "conversion", name: "تحويل العروض إلى وثائق", category: "production" },
      { key: "gwp", name: "إجمالي القسط المكتتب", category: "production" },
      { key: "non_awarded", name: "العروض غير المتفق عليها", category: "production" },
      { key: "by_line", name: "الإنتاج حسب فرع التأمين", category: "production" },
      { key: "by_insurer", name: "الإنتاج حسب شركة التأمين", category: "production" },
      { key: "commissions", name: "تحليل العمولات وتسويتها", category: "finance" },
      { key: "receivables", name: "الذمم المدينة (المستحقّ على العملاء)", category: "finance" },
      { key: "claims_status", name: "المطالبات حسب الحالة", category: "claims" },
      { key: "loss_ratio", name: "نسبة الخسارة (Loss Ratio)", category: "claims" },
      { key: "renewals", name: "الوثائق المستحقّة للتجديد", category: "production" },
      { key: "risk_analysis", name: "تحليل المخاطر والتوصيات", category: "compliance" },
      { key: "regulatory", name: "تقرير هيئة التأمين الموحّد", category: "regulatory" },
    ];
  }
}
