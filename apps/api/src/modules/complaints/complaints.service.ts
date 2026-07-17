import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ibp/db";
import { PrismaService } from "../../prisma/prisma.service";
import { SequenceService } from "../../common/sequence/sequence.service";
import { AuditService } from "../../common/audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";

export const COMPLAINT_CATEGORIES = ["pricing", "claims", "service", "sales_conduct", "billing", "data_privacy", "other"] as const;
export const COMPLAINT_SOURCES = ["phone", "email", "portal", "walk_in", "regulator", "social"] as const;
export const COMPLAINT_STATUSES = ["open", "investigating", "resolved", "escalated", "closed"] as const;
const OPEN_STATUSES = new Set(["open", "investigating", "escalated"]);

/** مهلة معالجة الشكوى الافتراضية (SLA) — أيام من الاستلام (توصية هيئة التأمين). */
const SLA_DAYS = 5;

/**
 * سجلّ الشكاوى (§6.1 — متطلب هيئة التأمين). كل شكوى بفئتها ومصدرها ومهلة معالجتها (SLA)
 * وإسنادها وتصعيدها للهيئة، مع تقرير تنظيمي دوري. معزول بالمستأجر (ALS) وبصلاحية `compliance`.
 */
@Injectable()
export class ComplaintsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seq: SequenceService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private overdue(c: { dueDate: Date | null; status: string }): boolean {
    return !!c.dueDate && OPEN_STATUSES.has(c.status) && new Date(c.dueDate).getTime() < Date.now();
  }

  /** قائمة الشكاوى (فلترة اختيارية بالحالة/الفئة) + علم التأخّر + اسم العميل. */
  async list(filter?: { status?: string; category?: string }) {
    const where: Prisma.ComplaintWhereInput = {
      ...(filter?.status ? { status: filter.status } : {}),
      ...(filter?.category ? { category: filter.category } : {}),
    };
    const rows = await this.prisma.complaint.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 });
    const clientIds = [...new Set(rows.map((r) => r.clientId).filter((x): x is string => !!x))];
    const clients = clientIds.length ? await this.prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } }) : [];
    const nameOf = Object.fromEntries(clients.map((c) => [c.id, c.name]));
    return rows.map((r) => ({
      id: r.id, sequenceNo: r.sequenceNo, category: r.category, source: r.source, subject: r.subject,
      status: r.status, priority: r.priority, clientId: r.clientId, clientName: r.clientId ? (nameOf[r.clientId] ?? "—") : null,
      dueDate: r.dueDate, overdue: this.overdue(r), escalated: r.escalated, createdAt: r.createdAt,
    }));
  }

  /** إنشاء شكوى: رقم تسلسلي + مهلة معالجة (SLA) + إشعار فريق الالتزام. */
  async create(tenantId: string, userId: string, dto: { category: string; source: string; subject: string; description: string; clientId?: string; policyId?: string; priority?: string; assigneeId?: string }) {
    if (!(COMPLAINT_CATEGORIES as readonly string[]).includes(dto.category)) throw new BadRequestException("فئة شكوى غير معروفة");
    if (!(COMPLAINT_SOURCES as readonly string[]).includes(dto.source)) throw new BadRequestException("مصدر شكوى غير معروف");
    const sequenceNo = await this.seq.nextComplaintSeq();
    const dueDate = new Date(Date.now() + SLA_DAYS * 86_400_000);
    const c = await this.prisma.complaint.create({
      data: {
        tenantId, sequenceNo, category: dto.category, source: dto.source, subject: dto.subject.trim(), description: dto.description.trim(),
        clientId: dto.clientId ?? null, policyId: dto.policyId ?? null, priority: dto.priority ?? "normal", assigneeId: dto.assigneeId ?? null, dueDate,
      },
    });
    await this.audit.log({ tenantId, userId, action: "create", entity: "complaint", entityId: c.id, meta: { sequenceNo, category: dto.category } });
    await this.notifications.notifyStaff(tenantId, "staff_complaint_created", { ref: sequenceNo }).catch(() => undefined);
    return c;
  }

  /** تفاصيل شكوى + الملاحظات (خط زمني داخلي) + اسم العميل والمُسنَد إليه. */
  async detail(id: string) {
    const c = await this.prisma.complaint.findFirst({ where: { id } });
    if (!c) throw new NotFoundException("الشكوى غير موجودة");
    const [client, assignee, activities] = await Promise.all([
      c.clientId ? this.prisma.client.findFirst({ where: { id: c.clientId }, select: { name: true } }) : Promise.resolve(null),
      c.assigneeId ? this.prisma.user.findFirst({ where: { id: c.assigneeId }, select: { fullName: true } }) : Promise.resolve(null),
      this.prisma.crmActivity.findMany({ where: { entityType: "complaint", entityId: id }, orderBy: { createdAt: "asc" } }),
    ]);
    const authorIds = [...new Set(activities.map((a) => a.authorId).filter((x): x is string => !!x))];
    const authors = authorIds.length ? await this.prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, fullName: true } }) : [];
    const authorName = Object.fromEntries(authors.map((a) => [a.id, a.fullName]));
    return {
      ...c, overdue: this.overdue(c), clientName: client?.name ?? null, assigneeName: assignee?.fullName ?? null,
      notes: activities.map((a) => ({ id: a.id, body: a.body, createdAt: a.createdAt, authorName: a.authorId ? (authorName[a.authorId] ?? "—") : "—" })),
    };
  }

  /** تحديث حالة/إسناد/أولوية الشكوى. */
  async update(tenantId: string, userId: string, id: string, dto: { status?: string; assigneeId?: string | null; priority?: string }) {
    const c = await this.prisma.complaint.findFirst({ where: { id }, select: { id: true } });
    if (!c) throw new NotFoundException("الشكوى غير موجودة");
    if (dto.status && !(COMPLAINT_STATUSES as readonly string[]).includes(dto.status)) throw new BadRequestException("حالة غير معروفة");
    const updated = await this.prisma.complaint.update({ where: { id }, data: { ...(dto.status ? { status: dto.status } : {}), ...(dto.assigneeId !== undefined ? { assigneeId: dto.assigneeId } : {}), ...(dto.priority ? { priority: dto.priority } : {}) } });
    await this.audit.log({ tenantId, userId, action: "update", entity: "complaint", entityId: id, meta: { ...dto } });
    return updated;
  }

  /** معالجة الشكوى: حالة resolved + وقت المعالجة + ملخّص الحلّ. */
  async resolve(tenantId: string, userId: string, id: string, resolution: string) {
    const c = await this.prisma.complaint.findFirst({ where: { id }, select: { id: true } });
    if (!c) throw new NotFoundException("الشكوى غير موجودة");
    if (!resolution?.trim()) throw new BadRequestException("ملخّص المعالجة مطلوب");
    const updated = await this.prisma.complaint.update({ where: { id }, data: { status: "resolved", resolution: resolution.trim(), resolvedAt: new Date() } });
    await this.audit.log({ tenantId, userId, action: "update", entity: "complaint", entityId: id, meta: { resolved: true } });
    return updated;
  }

  /** تصعيد الشكوى لهيئة التأمين. */
  async escalate(tenantId: string, userId: string, id: string) {
    const c = await this.prisma.complaint.findFirst({ where: { id }, select: { id: true } });
    if (!c) throw new NotFoundException("الشكوى غير موجودة");
    const updated = await this.prisma.complaint.update({ where: { id }, data: { status: "escalated", escalated: true, escalatedAt: new Date() } });
    await this.audit.log({ tenantId, userId, action: "update", entity: "complaint", entityId: id, meta: { escalated: true } });
    return updated;
  }

  /** ملاحظة داخلية على الشكوى (خط زمني). */
  async addNote(tenantId: string, userId: string, id: string, body: string) {
    const c = await this.prisma.complaint.findFirst({ where: { id }, select: { id: true } });
    if (!c) throw new NotFoundException("الشكوى غير موجودة");
    if (!body?.trim()) throw new BadRequestException("النص مطلوب");
    await this.prisma.crmActivity.create({ data: { tenantId, entityType: "complaint", entityId: id, type: "note", visibility: "internal", body: body.trim(), authorId: userId } });
    return this.detail(id);
  }

  /** التقرير التنظيمي: تجميع بالفئة والحالة + التزام SLA + متوسّط زمن المعالجة + المُصعَّدة. */
  async report() {
    const rows = await this.prisma.complaint.findMany({ select: { category: true, status: true, dueDate: true, escalated: true, createdAt: true, resolvedAt: true } });
    const byCategory: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let escalated = 0, overdue = 0, resolvedCount = 0, resolutionDaysSum = 0;
    for (const r of rows) {
      byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      if (r.escalated) escalated++;
      if (this.overdue(r)) overdue++;
      if (r.resolvedAt) { resolvedCount++; resolutionDaysSum += (new Date(r.resolvedAt).getTime() - new Date(r.createdAt).getTime()) / 86_400_000; }
    }
    const total = rows.length;
    const closed = (byStatus.resolved ?? 0) + (byStatus.closed ?? 0);
    return {
      total, byCategory, byStatus, escalated, overdue,
      slaCompliancePct: total ? Math.round(((total - overdue) / total) * 1000) / 10 : 100,
      avgResolutionDays: resolvedCount ? Math.round((resolutionDaysSum / resolvedCount) * 10) / 10 : 0,
      resolutionRatePct: total ? Math.round((closed / total) * 1000) / 10 : 0,
      slaDays: SLA_DAYS,
    };
  }
}
