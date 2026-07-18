import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RequestContextService } from "../../common/request-context/request-context.service";
import { AuditService } from "../../common/audit/audit.service";
import { TenantEmailService } from "../email/tenant-email.service";
import { ReportsService } from "./reports.service";
import { SCHEDULE_FREQUENCIES, SCHEDULE_REPORT_KEYS, type CreateReportScheduleDto, type UpdateReportScheduleDto } from "./dto/report-schedule.dto";

const money = (n: number) => `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;

/**
 * §7.3 — التقارير المجدولة: يرسل مالك الحساب ملخّصًا دوريًا (أسبوعي/شهري) لتقرير إداري
 * (لوحة التحكّم/العمولات/كشف المؤمِّن) إلى بريد الإدارة. يُوزَّع عبر **مجدول التذكيرات اليومي**
 * عند حلول `nextRunAt`، أو فورًا عبر «إرسال الآن». الملخّص يُبنى داخل سياق المستأجر (عزل).
 */
@Injectable()
export class ReportSchedulesService {
  private readonly logger = new Logger(ReportSchedulesService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContextService,
    private readonly audit: AuditService,
    private readonly email: TenantEmailService,
    private readonly reports: ReportsService,
  ) {}

  /** الموعد القادم من لحظة معيّنة حسب الدورية (أسبوعي +7 أيام · شهري +شهر). */
  private advance(from: Date, frequency: string): Date {
    const d = new Date(from);
    if (frequency === "weekly") d.setUTCDate(d.getUTCDate() + 7);
    else d.setUTCMonth(d.getUTCMonth() + 1);
    return d;
  }

  /** جداول التقارير للشركة (أحدث أولًا). */
  list(tenantId: string) {
    return this.prisma.reportSchedule.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
  }

  /** إنشاء جدول — يُحسب `nextRunAt` من الآن حسب الدورية. */
  async create(tenantId: string, userId: string, dto: CreateReportScheduleDto) {
    const nextRunAt = this.advance(new Date(), dto.frequency);
    const s = await this.prisma.reportSchedule.create({
      data: { tenantId, reportKey: dto.reportKey, frequency: dto.frequency, recipients: dto.recipients, nextRunAt, createdBy: userId },
    });
    await this.audit.log({ tenantId, userId, action: "create", entity: "report_schedule", entityId: s.id, meta: { reportKey: dto.reportKey, frequency: dto.frequency } });
    return s;
  }

  /** تعديل جدول (دورية/مستلمين/تفعيل). تغيير الدورية يُعيد حساب الموعد القادم. */
  async update(tenantId: string, userId: string, id: string, dto: UpdateReportScheduleDto) {
    const existing = await this.prisma.reportSchedule.findFirst({ where: { id, tenantId }, select: { id: true, frequency: true } });
    if (!existing) throw new NotFoundException("جدول التقرير غير موجود");
    const data: Record<string, unknown> = {};
    if (dto.recipients) data.recipients = dto.recipients;
    if (typeof dto.isActive === "boolean") data.isActive = dto.isActive;
    if (dto.frequency && dto.frequency !== existing.frequency) { data.frequency = dto.frequency; data.nextRunAt = this.advance(new Date(), dto.frequency); }
    await this.prisma.reportSchedule.update({ where: { id }, data });
    await this.audit.log({ tenantId, userId, action: "update", entity: "report_schedule", entityId: id, meta: dto as Record<string, unknown> });
    return { ok: true };
  }

  /** حذف جدول (معزول بالمستأجر). */
  async remove(tenantId: string, userId: string, id: string) {
    const r = await this.prisma.reportSchedule.deleteMany({ where: { id } });
    if (r.count === 0) throw new NotFoundException("جدول التقرير غير موجود");
    await this.audit.log({ tenantId, userId, action: "delete", entity: "report_schedule", entityId: id });
    return { ok: true };
  }

  /** «إرسال الآن» — يُوزّع جدولًا فورًا ويقدّم موعده القادم. */
  async runNow(tenantId: string, userId: string, id: string) {
    const s = await this.prisma.reportSchedule.findFirst({ where: { id, tenantId } });
    if (!s) throw new NotFoundException("جدول التقرير غير موجود");
    const sent = await this.dispatchOne(s);
    await this.audit.log({ tenantId, userId, action: "update", entity: "report_schedule_run", entityId: id, meta: { sent, manual: true } });
    return { ok: true, sent };
  }

  /**
   * توزيع كل الجداول المستحقّة (`nextRunAt ≤ now` ونشطة). يُستدعى من المسح اليومي.
   * خارج سياق الطلب (يعبر المستأجرين)؛ كل جدول يُوزَّع بمعرّف مستأجره الصريح.
   */
  async dispatchDue(now: Date, tenantId?: string): Promise<number> {
    const due = await this.ctx.run({}, async () =>
      this.prisma.reportSchedule.findMany({ where: { isActive: true, nextRunAt: { lte: now }, ...(tenantId ? { tenantId } : {}) } }),
    );
    let count = 0;
    for (const s of due) {
      try { await this.dispatchOne(s, now); count += 1; }
      catch (e) { this.logger.warn(`تعذّر توزيع تقرير مجدول ${s.id}: ${(e as Error).message}`); }
    }
    return count;
  }

  /** يبني الملخّص داخل سياق المستأجر ويرسله لكل مستلم، ثم يقدّم الموعد القادم. */
  private async dispatchOne(s: { id: string; tenantId: string; reportKey: string; frequency: string; recipients: string[] }, now = new Date()): Promise<number> {
    const { subject, body } = await this.ctx.run({ tenantId: s.tenantId }, () => this.buildSummary(s.reportKey));
    let sent = 0;
    for (const to of s.recipients) {
      const r = await this.email.sendTenantEmail(s.tenantId, to, subject, body, "ar");
      if (r.ok) sent += 1;
    }
    await this.ctx.run({}, async () =>
      this.prisma.reportSchedule.update({ where: { id: s.id }, data: { lastSentAt: now, nextRunAt: this.advance(now, s.frequency) } }),
    );
    return sent;
  }

  /** ملخّص نصّي لتقرير — يُنفَّذ داخل سياق المستأجر (تصفية العزل تلقائية عبر middleware). */
  private async buildSummary(reportKey: string): Promise<{ subject: string; body: string }> {
    if (!(SCHEDULE_REPORT_KEYS as readonly string[]).includes(reportKey)) throw new BadRequestException("تقرير غير مدعوم للجدولة");
    const today = new Date().toISOString().slice(0, 10);
    if (reportKey === "commissions") {
      const c = await this.reports.commissions();
      const body = [
        `تقرير العمولات — ${today}`,
        `• العمولات المتوقّعة: ${money(c.summary.total)}`,
        `• المستلمة: ${money(c.summary.received)} (${c.summary.receivedPct}%)`,
        `• المستحقّة (لم تُحصَّل): ${money(c.summary.accrued)}`,
        `• الفروق: ${money(c.summary.variance)}`,
        ``,
        `اطّلع على تفاصيل كل قيد في صفحة العمولات بمنصّتك.`,
      ].join("\n");
      return { subject: `تقرير العمولات الدوري — ${today}`, body };
    }
    if (reportKey === "bordereau") {
      const b = await this.reports.bordereau();
      const body = [
        `كشف المؤمِّن الدوري (Bordereau) — ${today}`,
        `• عدد الوثائق المُصدَرة: ${b.totals.count}`,
        `• إجمالي القسط: ${money(b.totals.gross)}`,
        `• عمولة الوساطة: ${money(b.totals.commission)}`,
        `• الصافي المستحقّ للمؤمِّنين: ${money(b.totals.netToInsurer)}`,
        ``,
        `الكشف التفصيلي وقابلية التصدير (CSV) في صفحة التقارير بمنصّتك.`,
      ].join("\n");
      return { subject: `كشف المؤمِّن الدوري — ${today}`, body };
    }
    // dashboard (افتراضي)
    const d = await this.reports.dashboard();
    const k = d.kpis;
    const body = [
      `ملخّص لوحة التحكّم — ${today}`,
      `• وثائق تقترب من الانتهاء (30 يومًا): ${k.expiring}`,
      `• طلبات قيد المعالجة: ${k.pendingRequests}`,
      `• وثائق بانتظار الاعتماد: ${k.pendingPolicies}`,
      `• تجديدات قادمة (60 يومًا): ${k.renewalsCount} بقيمة ${money(k.renewalsAmount)}`,
      `• عمولات مستحقّة (لم تُحصَّل): ${money(k.commissions)}`,
      ``,
      `اطّلع على اللوحة الكاملة في منصّتك.`,
    ].join("\n");
    return { subject: `ملخّص لوحة التحكّم الدوري — ${today}`, body };
  }
}

export { SCHEDULE_FREQUENCIES };
