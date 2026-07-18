import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ibp/db";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { BUDGET_PERIODS, type SetBudgetDto } from "./dto/budget.dto";

const num = (d: Prisma.Decimal | number | null) => (d == null ? 0 : Number(d));
const r2 = (n: number) => Math.round(n * 100) / 100;
// حسابات ذات طبيعة دائنة (الفعلي = دائن − مدين)؛ الباقي مدينة الطبيعة (مدين − دائن)
const CREDIT_NATURE = new Set(["revenue", "liability", "equity"]);

/**
 * §1.8 — الموازنة التقديرية ومقارنتها بالفعلي (Budget vs Actual). يضبط مالك الحساب مبلغًا
 * مُقدَّرًا لكل حساب في سنة/فترة (سنوية أو ربعية)، ويُقارَن بالفعلي المُشتقّ آليًا من حركة السندات
 * على الحساب ضمن نطاق تاريخ الفترة. **الانحراف** = الفعلي − الموازنة (+نسبة). معزول بالمستأجر وبصلاحية `finance`.
 */
@Injectable()
export class BudgetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** نطاق تاريخ الفترة [from, to] (UTC). سنوية = السنة كاملة؛ الأرباع ثلاثة أشهر لكلٍّ. */
  private periodRange(year: number, period: string): { from: Date; to: Date } {
    const quarters: Record<string, [number, number]> = { Q1: [0, 2], Q2: [3, 5], Q3: [6, 8], Q4: [9, 11] };
    if (period === "annual") return { from: new Date(Date.UTC(year, 0, 1)), to: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)) };
    const [sm, em] = quarters[period];
    return { from: new Date(Date.UTC(year, sm, 1)), to: new Date(Date.UTC(year, em + 1, 0, 23, 59, 59, 999)) };
  }

  /** يجمع حركة السندات (مدين/دائن) لكل حساب ضمن نطاق تاريخ (لاحتساب الفعلي). */
  private async actualsByAccount(from: Date, to: Date): Promise<Map<string, { debit: number; credit: number }>> {
    const vouchers = await this.prisma.voucher.findMany({ where: { createdAt: { gte: from, lte: to } }, select: { lines: true } });
    const m = new Map<string, { debit: number; credit: number }>();
    for (const v of vouchers) {
      const entries = ((v.lines as { entries?: Array<{ account?: string; debit?: number; credit?: number }> } | null)?.entries) ?? [];
      for (const e of entries) {
        const code = e.account;
        if (!code) continue;
        const g = m.get(code) ?? { debit: 0, credit: 0 };
        g.debit = r2(g.debit + num(e.debit));
        g.credit = r2(g.credit + num(e.credit));
        m.set(code, g);
      }
    }
    return m;
  }

  /** بنود الموازنة لسنة (كل الفترات) مع أسماء الحسابات. */
  async budgets(year: number) {
    const lines = await this.prisma.budgetLine.findMany({ where: { fiscalYear: year }, orderBy: [{ period: "asc" }, { accountCode: "asc" }] });
    const coa = await this.prisma.chartOfAccount.findMany({ select: { code: true, name: true, accountType: true } });
    const meta = new Map(coa.map((a) => [a.code, a]));
    return {
      year,
      lines: lines.map((l) => ({
        id: l.id,
        period: l.period,
        accountCode: l.accountCode,
        accountName: meta.get(l.accountCode)?.name ?? l.accountCode,
        accountType: meta.get(l.accountCode)?.accountType ?? null,
        amount: num(l.amount),
      })),
    };
  }

  /** ضبط بند موازنة (upsert يدوي على المفتاح الفريد tenantId+year+period+account). */
  async setBudget(tenantId: string, userId: string, dto: SetBudgetDto) {
    if (!(BUDGET_PERIODS as readonly string[]).includes(dto.period)) throw new BadRequestException("فترة موازنة غير صالحة");
    const acc = await this.prisma.chartOfAccount.findFirst({ where: { code: dto.accountCode }, select: { code: true } });
    if (!acc) throw new BadRequestException("الحساب غير موجود في شجرة الحسابات");
    const amount = r2(dto.amount);
    const existing = await this.prisma.budgetLine.findFirst({ where: { fiscalYear: dto.fiscalYear, period: dto.period, accountCode: dto.accountCode }, select: { id: true } });
    if (existing) await this.prisma.budgetLine.update({ where: { id: existing.id }, data: { amount } });
    else await this.prisma.budgetLine.create({ data: { tenantId, fiscalYear: dto.fiscalYear, period: dto.period, accountCode: dto.accountCode, amount } });
    await this.audit.log({ tenantId, userId, action: "update", entity: "budget_line", entityId: `${dto.fiscalYear}/${dto.period}/${dto.accountCode}`, meta: { amount } });
    return { ok: true };
  }

  /** حذف بند موازنة (معزول بالمستأجر عبر deleteMany). */
  async deleteBudget(tenantId: string, userId: string, id: string) {
    const r = await this.prisma.budgetLine.deleteMany({ where: { id } });
    if (r.count === 0) throw new NotFoundException("بند الموازنة غير موجود");
    await this.audit.log({ tenantId, userId, action: "delete", entity: "budget_line", entityId: id });
    return { ok: true };
  }

  /**
   * الموازنة مقابل الفعلي لفترة: لكل بند موازنة (سنة+فترة) يُحتسب الفعلي بطبيعة الحساب
   * (مدين−دائن للمصروف/الأصل · دائن−مدين للإيراد/الخصم/حقوق الملكية) و**الانحراف** = الفعلي − الموازنة.
   */
  async vsActual(year: number, period: string) {
    if (!(BUDGET_PERIODS as readonly string[]).includes(period)) throw new BadRequestException("فترة موازنة غير صالحة");
    const { from, to } = this.periodRange(year, period);
    const lines = await this.prisma.budgetLine.findMany({ where: { fiscalYear: year, period }, orderBy: { accountCode: "asc" } });
    const coa = await this.prisma.chartOfAccount.findMany({ select: { code: true, name: true, accountType: true } });
    const meta = new Map(coa.map((a) => [a.code, a]));
    const actuals = await this.actualsByAccount(from, to);
    const rows = lines.map((l) => {
      const m = meta.get(l.accountCode);
      const mv = actuals.get(l.accountCode) ?? { debit: 0, credit: 0 };
      const actual = CREDIT_NATURE.has(m?.accountType ?? "") ? r2(mv.credit - mv.debit) : r2(mv.debit - mv.credit);
      const budget = num(l.amount);
      const variance = r2(actual - budget);
      return {
        id: l.id,
        accountCode: l.accountCode,
        accountName: m?.name ?? l.accountCode,
        accountType: m?.accountType ?? null,
        budget,
        actual,
        variance, // الفعلي − الموازنة (للمصروف: موجب ⇒ تجاوز؛ للإيراد: موجب ⇒ تفوّق)
        variancePct: budget !== 0 ? r2((variance / budget) * 100) : null,
      };
    });
    return {
      year,
      period,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      rows,
      totals: {
        budget: r2(rows.reduce((s, r) => s + r.budget, 0)),
        actual: r2(rows.reduce((s, r) => s + r.actual, 0)),
        variance: r2(rows.reduce((s, r) => s + r.variance, 0)),
      },
    };
  }
}
