import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ibp/db";
import { PrismaService } from "../../prisma/prisma.service";
import { SequenceService } from "../../common/sequence/sequence.service";
import { AuditService } from "../../common/audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";

// عوامل الخطر وأوزانها (النهج القائم على المخاطر — RBA) ⇒ درجة 0..100 ثم مستوى.
export const AML_FACTORS = ["pep", "sanctionsHit", "highRiskCountry", "nonResident", "cashIntensive", "complexStructure", "adverseMedia"] as const;
export type AmlFactorKey = (typeof AML_FACTORS)[number];
const FACTOR_WEIGHT: Record<AmlFactorKey, number> = {
  sanctionsHit: 50, pep: 30, highRiskCountry: 20, complexStructure: 15, cashIntensive: 15, adverseMedia: 15, nonResident: 10,
};
export const AML_RISK_LEVELS = ["low", "medium", "high"] as const;
export const SCREENING_RESULTS = ["clear", "potential_match", "confirmed_match"] as const;
export const SCREENING_DISPOSITIONS = ["pending", "cleared", "escalated"] as const;
export const STR_STATUSES = ["draft", "filed", "closed"] as const;
export const STR_INDICATORS = ["unusual_volume", "structuring", "third_party_payment", "high_risk_jurisdiction", "pep_involvement", "adverse_media", "inconsistent_activity", "refusal_of_info", "other"] as const;

// دورية إعادة التقييم حسب المستوى (يومًا) — الأعلى مخاطرةً يُراجَع أكثر تواترًا (EDD).
const REVIEW_DAYS: Record<string, number> = { high: 180, medium: 365, low: 730 };

/**
 * قائمة فرز تجريبية (Sandbox) — تُستبدل بقوائم حقيقية (UN/OFAC/EU/محلية/PEP) عبر تكامل مزوّد (§9.3).
 * أسماء وهمية بحتة لأغراض العرض والاختبار.
 */
const WATCHLIST: Array<{ name: string; list: string; type: "sanctions" | "pep" }> = [
  { name: "خالد عبدالله الممنوع", list: "local", type: "sanctions" },
  { name: "Sanctioned Trading Co", list: "ofac", type: "sanctions" },
  { name: "Global Terror Finance Ltd", list: "un", type: "sanctions" },
  { name: "علي وزير سابق", list: "pep", type: "pep" },
  { name: "Politically Exposed Person", list: "pep", type: "pep" },
];
const normalize = (s: string) =>
  s.toLowerCase().replace(/[ً-ْ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * مكافحة غسل الأموال وتمويل الإرهاب (AML/CFT) — §6.2، متطلّب ترخيصي (هيئة التأمين/ساما):
 * (1) تقييم مخاطر العميل بعوامل موزونة، (2) فرز العقوبات/الأشخاص المعرّضين سياسيًا (PEP)،
 * (3) سجلّ بلاغات الاشتباه (STR). معزول بالمستأجر (ALS) وبصلاحية `compliance`.
 */
@Injectable()
export class AmlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seq: SequenceService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** اشتقاق الدرجة والمستوى من عوامل الخطر (تطابق العقوبات يفرض «مرتفع» دائمًا). */
  private score(factors: Record<string, boolean>): { score: number; level: string } {
    let score = 0;
    for (const k of AML_FACTORS) if (factors[k]) score += FACTOR_WEIGHT[k];
    score = Math.min(100, score);
    let level = score >= 60 ? "high" : score >= 30 ? "medium" : "low";
    if (factors.sanctionsHit) level = "high"; // تطابق عقوبات ⇒ مرتفع حتمًا
    return { score, level };
  }

  // ── تقييم المخاطر ─────────────────────────────────────────────────────────
  /** تقييم مخاطر AML لعميل: يحسب الدرجة/المستوى، يسجّل التقييم، ويُحدّث ملخّص العميل + موعد المراجعة. */
  async assess(tenantId: string, userId: string, clientId: string, dto: { factors: Record<string, boolean>; rationale?: string }) {
    const client = await this.prisma.client.findFirst({ where: { id: clientId }, select: { id: true, name: true } });
    if (!client) throw new NotFoundException("العميل غير موجود");
    const factors: Record<string, boolean> = {};
    for (const k of AML_FACTORS) factors[k] = !!dto.factors?.[k];
    const { score, level } = this.score(factors);
    const reviewDue = new Date(Date.now() + (REVIEW_DAYS[level] ?? 365) * 86_400_000);
    const assessment = await this.prisma.amlRiskAssessment.create({
      data: { tenantId, clientId, level, score, factors: factors as Prisma.InputJsonValue, rationale: dto.rationale?.trim() || null, assessedById: userId, reviewDue },
    });
    await this.prisma.client.update({ where: { id: clientId }, data: { amlRiskLevel: level, amlRiskScore: score, amlRiskAssessedAt: new Date(), amlReviewDue: reviewDue } });
    await this.audit.log({ tenantId, userId, action: "assess", entity: "aml_risk", entityId: clientId, meta: { level, score } });
    if (level === "high") await this.notifications.notifyStaff(tenantId, "staff_aml_alert", { ref: `${client.name} — مخاطر مرتفعة` }).catch(() => undefined);
    return { ...assessment, clientName: client.name };
  }

  // ── الفرز (العقوبات/PEP) ──────────────────────────────────────────────────
  /** فرز اسم (افتراضيًا اسم العميل) ضدّ قوائم العقوبات/PEP التجريبية ⇒ سجلّ فرز بنتيجته. */
  async screen(tenantId: string, userId: string, dto: { clientId?: string; name?: string }) {
    let name = dto.name?.trim();
    if (!name && dto.clientId) {
      const client = await this.prisma.client.findFirst({ where: { id: dto.clientId }, select: { name: true } });
      if (!client) throw new NotFoundException("العميل غير موجود");
      name = client.name;
    }
    if (!name) throw new BadRequestException("اسم الفرز أو معرّف العميل مطلوب");
    const target = normalize(name);
    const matches: Array<{ list: string; matchedName: string; score: number; type: string }> = [];
    for (const w of WATCHLIST) {
      const wn = normalize(w.name);
      if (wn === target) matches.push({ list: w.list, matchedName: w.name, score: 100, type: w.type });
      else {
        const wt = new Set(wn.split(" ").filter(Boolean));
        const tt = target.split(" ").filter(Boolean);
        const shared = tt.filter((t) => wt.has(t)).length;
        const ratio = wt.size ? shared / wt.size : 0;
        if (ratio >= 0.6) matches.push({ list: w.list, matchedName: w.name, score: Math.round(ratio * 100), type: w.type });
      }
    }
    const exact = matches.some((m) => m.score === 100);
    const result = exact ? "confirmed_match" : matches.length ? "potential_match" : "clear";
    const lists = [...new Set(WATCHLIST.map((w) => w.list))].join(",");
    const rec = await this.prisma.amlScreening.create({
      data: { tenantId, clientId: dto.clientId ?? null, screenedName: name, lists, result, matches: matches.length ? (matches as Prisma.InputJsonValue) : Prisma.JsonNull, disposition: result === "clear" ? "cleared" : "pending", screenedById: userId },
    });
    await this.audit.log({ tenantId, userId, action: "screen", entity: "aml_screening", entityId: rec.id, meta: { result, matches: matches.length } });
    if (result !== "clear") await this.notifications.notifyStaff(tenantId, "staff_aml_alert", { ref: `فرز «${name}»: ${result === "confirmed_match" ? "تطابق مؤكّد" : "تطابق محتمل"}` }).catch(() => undefined);
    return rec;
  }

  /** التصرّف حيال نتيجة فرز: cleared (إيجابي كاذب) أو escalated (تطابق حقيقي ⇒ يستوجب بلاغًا). */
  async disposeScreening(tenantId: string, userId: string, id: string, dto: { disposition: string; note?: string }) {
    if (!(SCREENING_DISPOSITIONS as readonly string[]).includes(dto.disposition)) throw new BadRequestException("تصرّف غير معروف");
    const rec = await this.prisma.amlScreening.findFirst({ where: { id }, select: { id: true } });
    if (!rec) throw new NotFoundException("سجلّ الفرز غير موجود");
    const updated = await this.prisma.amlScreening.update({ where: { id }, data: { disposition: dto.disposition, note: dto.note?.trim() || null } });
    await this.audit.log({ tenantId, userId, action: "update", entity: "aml_screening", entityId: id, meta: { disposition: dto.disposition } });
    return updated;
  }

  async screenings(clientId?: string) {
    const rows = await this.prisma.amlScreening.findMany({ where: clientId ? { clientId } : {}, orderBy: { createdAt: "desc" }, take: 500 });
    return this.withClientNames(rows);
  }

  // ── بلاغات الاشتباه (STR) ─────────────────────────────────────────────────
  /** إنشاء بلاغ اشتباه (STR): رقم تسلسلي + مؤشّرات + حالة أولية (مسودّة/مرفوع). */
  async createReport(tenantId: string, userId: string, dto: { clientId?: string; subject: string; description: string; indicators: string[]; fileNow?: boolean; reference?: string }) {
    const bad = (dto.indicators ?? []).filter((i) => !(STR_INDICATORS as readonly string[]).includes(i));
    if (bad.length) throw new BadRequestException(`مؤشّر اشتباه غير معروف: ${bad.join(", ")}`);
    const sequenceNo = await this.seq.nextStrSeq();
    const filed = !!dto.fileNow;
    const report = await this.prisma.suspiciousReport.create({
      data: {
        tenantId, sequenceNo, clientId: dto.clientId ?? null, subject: dto.subject.trim(), description: dto.description.trim(),
        indicators: (dto.indicators ?? []) as Prisma.InputJsonValue, status: filed ? "filed" : "draft",
        reference: dto.reference?.trim() || null, filedAt: filed ? new Date() : null, filedById: filed ? userId : null,
      },
    });
    await this.audit.log({ tenantId, userId, action: "create", entity: "suspicious_report", entityId: report.id, meta: { sequenceNo, status: report.status } });
    await this.notifications.notifyStaff(tenantId, "staff_aml_alert", { ref: `بلاغ اشتباه ${sequenceNo}` }).catch(() => undefined);
    return report;
  }

  /** تحديث حالة/مرجع بلاغ الاشتباه (مسودّة ⇒ مرفوع ⇒ مغلق). */
  async updateReport(tenantId: string, userId: string, id: string, dto: { status?: string; reference?: string; description?: string }) {
    const r = await this.prisma.suspiciousReport.findFirst({ where: { id } });
    if (!r) throw new NotFoundException("بلاغ الاشتباه غير موجود");
    if (dto.status && !(STR_STATUSES as readonly string[]).includes(dto.status)) throw new BadRequestException("حالة غير معروفة");
    const data: Prisma.SuspiciousReportUpdateInput = {
      ...(dto.reference !== undefined ? { reference: dto.reference?.trim() || null } : {}),
      ...(dto.description ? { description: dto.description.trim() } : {}),
    };
    if (dto.status && dto.status !== r.status) {
      data.status = dto.status;
      if (dto.status === "filed" && !r.filedAt) { data.filedAt = new Date(); data.filedById = userId; }
      if (dto.status === "closed") data.closedAt = new Date();
    }
    const updated = await this.prisma.suspiciousReport.update({ where: { id }, data });
    await this.audit.log({ tenantId, userId, action: "update", entity: "suspicious_report", entityId: id, meta: { ...dto } });
    return updated;
  }

  async reports(status?: string) {
    const rows = await this.prisma.suspiciousReport.findMany({ where: status ? { status } : {}, orderBy: { createdAt: "desc" }, take: 500 });
    return this.withClientNames(rows);
  }

  async reportDetail(id: string) {
    const r = await this.prisma.suspiciousReport.findFirst({ where: { id } });
    if (!r) throw new NotFoundException("بلاغ الاشتباه غير موجود");
    const client = r.clientId ? await this.prisma.client.findFirst({ where: { id: r.clientId }, select: { name: true } }) : null;
    return { ...r, clientName: client?.name ?? null };
  }

  // ── سجلّ العملاء (الملف AML) + النظرة العامة + التقرير ──────────────────────
  /** سجلّ العملاء بملفّهم الرقابي (مستوى الخطر/آخر تقييم/موعد المراجعة/آخر فرز). */
  async clients(filter?: { level?: string }) {
    const where: Prisma.ClientWhereInput = { erasedAt: null, ...(filter?.level ? { amlRiskLevel: filter.level } : {}) };
    const rows = await this.prisma.client.findMany({ where, orderBy: { createdAt: "desc" }, take: 1000, select: { id: true, name: true, type: true, complianceStatus: true, amlRiskLevel: true, amlRiskScore: true, amlRiskAssessedAt: true, amlReviewDue: true } });
    const now = Date.now();
    return rows.map((c) => ({ ...c, assessed: !!c.amlRiskLevel, reviewOverdue: !!c.amlReviewDue && new Date(c.amlReviewDue).getTime() < now }));
  }

  /** ملفّ AML كامل لعميل: آخر تقييم + تاريخ التقييمات + الفرز + بلاغات الاشتباه المرتبطة. */
  async clientProfile(clientId: string) {
    const client = await this.prisma.client.findFirst({ where: { id: clientId }, select: { id: true, name: true, type: true, complianceStatus: true, amlRiskLevel: true, amlRiskScore: true, amlRiskAssessedAt: true, amlReviewDue: true } });
    if (!client) throw new NotFoundException("العميل غير موجود");
    const [assessments, screenings, reports] = await Promise.all([
      this.prisma.amlRiskAssessment.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, take: 20 }),
      this.prisma.amlScreening.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, take: 20 }),
      this.prisma.suspiciousReport.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, take: 20 }),
    ]);
    return { client, assessments, screenings, reports };
  }

  /** نظرة عامة على الامتثال (AML): توزيع المخاطر + الفرز المعلّق + بلاغات الاشتباه + العملاء بلا تقييم/مراجعة متأخّرة. */
  async overview() {
    const [byLevel, unassessed, screenByResult, pendingDisp, strByStatus, allClients] = await Promise.all([
      this.prisma.client.groupBy({ by: ["amlRiskLevel"], where: { erasedAt: null, amlRiskLevel: { not: null } }, _count: true }),
      this.prisma.client.count({ where: { erasedAt: null, amlRiskLevel: null } }),
      this.prisma.amlScreening.groupBy({ by: ["result"], _count: true }),
      this.prisma.amlScreening.count({ where: { disposition: "pending" } }),
      this.prisma.suspiciousReport.groupBy({ by: ["status"], _count: true }),
      this.prisma.client.findMany({ where: { erasedAt: null, amlReviewDue: { lt: new Date() } }, select: { id: true } }),
    ]);
    return {
      riskDistribution: byLevel.map((r) => ({ level: r.amlRiskLevel ?? "—", count: r._count })),
      unassessed,
      reviewOverdue: allClients.length,
      screeningsByResult: screenByResult.map((r) => ({ result: r.result, count: r._count })),
      pendingDispositions: pendingDisp,
      strByStatus: strByStatus.map((r) => ({ status: r.status, count: r._count })),
    };
  }

  /** التقرير التنظيمي الدوري (AML): مؤشّرات الفرز والبلاغات وتوزيع المخاطر — أساس التقديم للهيئة/الوحدة. */
  async report() {
    const [byLevel, screenByResult, strByStatus, escalatedScreenings, totalClients, assessedClients] = await Promise.all([
      this.prisma.client.groupBy({ by: ["amlRiskLevel"], where: { erasedAt: null, amlRiskLevel: { not: null } }, _count: true }),
      this.prisma.amlScreening.groupBy({ by: ["result"], _count: true }),
      this.prisma.suspiciousReport.groupBy({ by: ["status"], _count: true }),
      this.prisma.amlScreening.count({ where: { disposition: "escalated" } }),
      this.prisma.client.count({ where: { erasedAt: null } }),
      this.prisma.client.count({ where: { erasedAt: null, amlRiskLevel: { not: null } } }),
    ]);
    const riskDistribution: Record<string, number> = {};
    for (const r of byLevel) riskDistribution[r.amlRiskLevel ?? "—"] = r._count;
    const screeningsByResult: Record<string, number> = {};
    for (const r of screenByResult) screeningsByResult[r.result] = r._count;
    const strFiled = strByStatus.filter((s) => s.status === "filed" || s.status === "closed").reduce((a, s) => a + s._count, 0);
    return {
      totalClients, assessedClients,
      coveragePct: totalClients ? Math.round((assessedClients / totalClients) * 1000) / 10 : 0,
      riskDistribution, screeningsByResult, escalatedScreenings,
      strTotal: strByStatus.reduce((a, s) => a + s._count, 0), strFiled,
      strByStatus: Object.fromEntries(strByStatus.map((s) => [s.status, s._count])),
    };
  }

  private async withClientNames<T extends { clientId: string | null }>(rows: T[]): Promise<Array<T & { clientName: string | null }>> {
    const ids = [...new Set(rows.map((r) => r.clientId).filter((x): x is string => !!x))];
    const clients = ids.length ? await this.prisma.client.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
    const nameOf = Object.fromEntries(clients.map((c) => [c.id, c.name]));
    return rows.map((r) => ({ ...r, clientName: r.clientId ? (nameOf[r.clientId] ?? "—") : null }));
  }
}
