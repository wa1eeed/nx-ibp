import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";

type Scope = "producer" | "line";
type Metric = "premium" | "policies" | "commissions";
type Period = "month" | "quarter" | "year";

const SCOPES: Scope[] = ["producer", "line"];
const METRICS: Metric[] = ["premium", "policies", "commissions"];
const PERIODS: Period[] = ["month", "quarter", "year"];

export interface CreateTargetInput {
  scope: Scope;
  scopeRefId: string;
  metric: Metric;
  period: Period;
  periodStart: string; // ISO date
  targetValue: number;
}

const num = (v: unknown) => Number(v ?? 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** نهاية الفترة (حصريّة) انطلاقًا من بدايتها ونوعها. */
function periodEnd(start: Date, period: Period): Date {
  const d = new Date(start);
  if (period === "month") d.setMonth(d.getMonth() + 1);
  else if (period === "quarter") d.setMonth(d.getMonth() + 3);
  else d.setFullYear(d.getFullYear() + 1);
  return d;
}

/**
 * أهداف الأداء (P1-B): تحديد أهداف إنتاج للمنتِجين/فروع التأمين وقياس الإنجاز.
 * **الفعلي محسوب من بيانات الإنتاج القائمة** (الوثائق المُصدَرة) — لا تُنشأ بيانات جديدة.
 */
@Injectable()
export class TargetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** خيارات الإنشاء: المنتِجون + فروع التأمين المتاحة (لقائمة scopeRefId). */
  async options(tenantId: string) {
    const [producers, lines] = await Promise.all([
      this.prisma.producer.findMany({ where: { tenantId }, select: { id: true, name: true } }),
      this.prisma.policy.findMany({ where: { tenantId, productLineCode: { not: null } }, select: { productLineCode: true }, distinct: ["productLineCode"] }),
    ]);
    return {
      producers: producers.map((p) => ({ id: p.id, name: p.name })),
      lines: lines.map((l) => l.productLineCode).filter(Boolean),
      metrics: METRICS,
      periods: PERIODS,
      scopes: SCOPES,
    };
  }

  async create(tenantId: string, userId: string, dto: CreateTargetInput) {
    if (!SCOPES.includes(dto.scope)) throw new BadRequestException("نطاق غير معروف");
    if (!METRICS.includes(dto.metric)) throw new BadRequestException("مقياس غير معروف");
    if (!PERIODS.includes(dto.period)) throw new BadRequestException("فترة غير معروفة");
    const start = new Date(dto.periodStart);
    if (Number.isNaN(start.getTime())) throw new BadRequestException("تاريخ بداية غير صالح");
    if (!(dto.targetValue > 0)) throw new BadRequestException("قيمة الهدف يجب أن تكون موجبة");
    if (!dto.scopeRefId?.trim()) throw new BadRequestException("يجب تحديد المنتِج/الفرع");

    const t = await this.prisma.target.create({
      data: { tenantId, scope: dto.scope, scopeRefId: dto.scopeRefId.trim(), metric: dto.metric, period: dto.period, periodStart: start, targetValue: dto.targetValue, createdBy: userId },
      select: { id: true },
    });
    await this.audit.log({ tenantId, userId, action: "create", entity: "target", entityId: t.id, meta: { scope: dto.scope, metric: dto.metric } });
    return this.detail(tenantId, t.id);
  }

  async remove(tenantId: string, userId: string, id: string) {
    await this.prisma.target.deleteMany({ where: { id, tenantId } });
    await this.audit.log({ tenantId, userId, action: "delete", entity: "target", entityId: id });
    return { ok: true };
  }

  /** قائمة الأهداف مع الفعلي المحسوب و% الإنجاز؛ فلترة اختيارية بالفترة. */
  async list(tenantId: string, filter?: { period?: string }) {
    const where: { tenantId: string; period?: string } = { tenantId };
    if (filter?.period && PERIODS.includes(filter.period as Period)) where.period = filter.period;
    const targets = await this.prisma.target.findMany({ where, orderBy: { createdAt: "desc" } });
    const labels = await this.labels(tenantId);
    return Promise.all(targets.map((t) => this.enrich(tenantId, t, labels)));
  }

  private async detail(tenantId: string, id: string) {
    const t = await this.prisma.target.findFirst({ where: { id, tenantId } });
    if (!t) throw new BadRequestException("الهدف غير موجود");
    return this.enrich(tenantId, t, await this.labels(tenantId));
  }

  /** خرائط أسماء المنتِجين (للعرض). */
  private async labels(tenantId: string): Promise<Map<string, string>> {
    const producers = await this.prisma.producer.findMany({ where: { tenantId }, select: { id: true, name: true } });
    return new Map(producers.map((p) => [p.id, p.name]));
  }

  private async enrich(tenantId: string, t: { id: string; scope: string; scopeRefId: string; metric: string; period: string; periodStart: Date; targetValue: unknown }, producerNames: Map<string, string>) {
    const start = new Date(t.periodStart);
    const end = periodEnd(start, t.period as Period);
    const where = {
      tenantId,
      status: "ISSUED" as const,
      createdAt: { gte: start, lt: end },
      ...(t.scope === "producer" ? { producerId: t.scopeRefId } : { productLineCode: t.scopeRefId }),
    };
    let actual = 0;
    if (t.metric === "policies") {
      actual = await this.prisma.policy.count({ where });
    } else {
      const rows = await this.prisma.policy.findMany({ where, select: { totalPremium: true, commissionAmount: true } });
      actual = r2(rows.reduce((s, p) => s + num(t.metric === "premium" ? p.totalPremium : p.commissionAmount), 0));
    }
    const target = num(t.targetValue);
    const achievementPct = target > 0 ? Math.round((actual / target) * 100) : 0;
    const label = t.scope === "producer" ? (producerNames.get(t.scopeRefId) ?? t.scopeRefId) : t.scopeRefId;
    return { id: t.id, scope: t.scope, scopeRefId: t.scopeRefId, label, metric: t.metric, period: t.period, periodStart: start, target, actual, achievementPct };
  }
}
