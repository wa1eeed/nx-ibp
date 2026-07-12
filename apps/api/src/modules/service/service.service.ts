import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ibp/db";
import { PrismaService } from "../../prisma/prisma.service";
import { SequenceService } from "../../common/sequence/sequence.service";
import { AuditService } from "../../common/audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import type { CreateServiceRequestDto } from "./dto/service.dto";

const asJson = (v: unknown) => v as Prisma.InputJsonValue;
const FIELDS = {
  id: true, sequenceNo: true, type: true, subject: true, status: true,
  priority: true, assigneeId: true, clientId: true, policyId: true, tenantId: true,
  createdAt: true, updatedAt: true, details: true,
} as const;

interface ListFilter { status?: string; assigneeId?: string; mine?: boolean }

/**
 * خدمة العملاء (المرحلة 6، مُطوَّرة): استقبال طلبات العملاء (إضافة/حذف/تعديل/استفسار/تجديد)
 * وإسنادها لموظف بأولوية، ومتابعتها بخطّ زمني (ملاحظات/تغييرات) حتى الإغلاق.
 * معزولة بالمستأجر ومسجّلة في التدقيق. الخطّ الزمني يُخزَّن في CrmActivity (entityType="service").
 */
@Injectable()
export class ServiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seq: SequenceService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** إثراء الطلبات بأسماء العميل والموظف المُسنَد (assigneeId/clientId مجرّد نصوص لا علاقات). */
  private async enrich<T extends { clientId: string | null; assigneeId: string | null }>(rows: T[]) {
    const clientIds = [...new Set(rows.map((r) => r.clientId).filter(Boolean) as string[])];
    const userIds = [...new Set(rows.map((r) => r.assigneeId).filter(Boolean) as string[])];
    const [clients, users] = await Promise.all([
      clientIds.length ? this.prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } }) : [],
      userIds.length ? this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } }) : [],
    ]);
    const cn = new Map(clients.map((c) => [c.id, c.name]));
    const un = new Map(users.map((u) => [u.id, u.fullName]));
    return rows.map((r) => ({ ...r, clientName: r.clientId ? cn.get(r.clientId) ?? null : null, assigneeName: r.assigneeId ? un.get(r.assigneeId) ?? null : null }));
  }

  /** موظّفو المستأجر النشطون (للإسناد) — مفلتَر تلقائيًا بالمستأجر. */
  assignableStaff() {
    return this.prisma.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } });
  }

  async list(filter: ListFilter = {}, userId?: string) {
    const where: Prisma.ServiceRequestWhereInput = {};
    if (filter.status) where.status = filter.status as never;
    if (filter.mine && userId) where.assigneeId = userId;
    else if (filter.assigneeId) where.assigneeId = filter.assigneeId;
    const rows = await this.prisma.serviceRequest.findMany({ where, orderBy: [{ status: "asc" }, { createdAt: "desc" }], select: FIELDS });
    return this.enrich(rows);
  }

  async detail(id: string) {
    const sr = await this.prisma.serviceRequest.findFirst({ where: { id }, select: FIELDS });
    if (!sr) throw new NotFoundException("طلب الخدمة غير موجود");
    const [enriched] = await this.enrich([sr]);
    const [policy, timeline] = await Promise.all([
      sr.policyId ? this.prisma.policy.findFirst({ where: { id: sr.policyId }, select: { id: true, sequenceNo: true } }) : Promise.resolve(null),
      this.prisma.crmActivity.findMany({ where: { entityType: "service", entityId: id }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, type: true, body: true, createdAt: true } }),
    ]);
    return { ...enriched, policy, timeline };
  }

  async create(tenantId: string, userId: string, dto: CreateServiceRequestDto) {
    const sequenceNo = await this.seq.nextServiceSeq();
    const sr = await this.prisma.serviceRequest.create({
      data: {
        tenantId,
        sequenceNo,
        clientId: dto.clientId ?? null,
        policyId: dto.policyId ?? null,
        type: dto.type,
        subject: dto.subject ?? null,
        priority: dto.priority ?? "normal",
        assigneeId: dto.assigneeId ?? null,
        status: "OPEN",
        details: dto.details ? asJson(dto.details) : undefined,
      },
      select: FIELDS,
    });
    await this.audit.log({ tenantId, userId, action: "create", entity: "service_request", entityId: sr.id, meta: { type: dto.type, sequenceNo } });
    await this.logActivity(tenantId, userId, sr.id, "note", `أُنشئ طلب الخدمة (${dto.type})`);
    if (sr.assigneeId) await this.notifyAssignee(tenantId, sr.assigneeId, sr.sequenceNo, sr.subject);
    // إشعار العميل باستلام طلب الخدمة (لا يُفشل إنشاء الطلب عند تعذّره)
    if (sr.clientId) {
      const client = await this.prisma.client.findFirst({ where: { id: sr.clientId }, select: { email: true, phone: true } });
      if (client) void this.notifications.notify(tenantId, "request_ack", { email: client.email ?? undefined, phone: client.phone ?? undefined, clientId: sr.clientId ?? undefined }, { ref: sequenceNo }).catch(() => undefined);
    }
    const [enriched] = await this.enrich([sr]);
    return enriched;
  }

  async setStatus(tenantId: string, userId: string, id: string, status: string) {
    const exists = await this.prisma.serviceRequest.findFirst({ where: { id }, select: { id: true, status: true } });
    if (!exists) throw new NotFoundException("طلب الخدمة غير موجود");
    const updated = await this.prisma.serviceRequest.update({ where: { id }, data: { status: status as never }, select: FIELDS });
    await this.audit.log({ tenantId, userId, action: "update", entity: "service_request", entityId: id, meta: { status } });
    if (status !== exists.status) await this.logActivity(tenantId, userId, id, "stage_change", `تغيّرت الحالة إلى «${status}»`);
    const [enriched] = await this.enrich([updated]);
    return enriched;
  }

  async assign(tenantId: string, userId: string, id: string, assigneeId: string | null) {
    const exists = await this.prisma.serviceRequest.findFirst({ where: { id }, select: { id: true, sequenceNo: true, subject: true, assigneeId: true } });
    if (!exists) throw new NotFoundException("طلب الخدمة غير موجود");
    let name: string | null = null;
    if (assigneeId) {
      const u = await this.prisma.user.findFirst({ where: { id: assigneeId }, select: { fullName: true } });
      if (!u) throw new NotFoundException("الموظف غير موجود");
      name = u.fullName;
    }
    const updated = await this.prisma.serviceRequest.update({ where: { id }, data: { assigneeId }, select: FIELDS });
    await this.audit.log({ tenantId, userId, action: "update", entity: "service_request", entityId: id, meta: { assigneeId } });
    await this.logActivity(tenantId, userId, id, "note", assigneeId ? `أُسنِد إلى ${name}` : "أُلغي الإسناد");
    if (assigneeId && assigneeId !== exists.assigneeId) await this.notifyAssignee(tenantId, assigneeId, exists.sequenceNo, exists.subject);
    const [enriched] = await this.enrich([updated]);
    return enriched;
  }

  async setPriority(tenantId: string, userId: string, id: string, priority: string) {
    const exists = await this.prisma.serviceRequest.findFirst({ where: { id }, select: { id: true, priority: true } });
    if (!exists) throw new NotFoundException("طلب الخدمة غير موجود");
    const updated = await this.prisma.serviceRequest.update({ where: { id }, data: { priority }, select: FIELDS });
    await this.audit.log({ tenantId, userId, action: "update", entity: "service_request", entityId: id, meta: { priority } });
    if (priority !== exists.priority) await this.logActivity(tenantId, userId, id, "note", `تغيّرت الأولوية إلى «${priority}»`);
    const [enriched] = await this.enrich([updated]);
    return enriched;
  }

  async addNote(tenantId: string, userId: string, id: string, body: string) {
    const exists = await this.prisma.serviceRequest.findFirst({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException("طلب الخدمة غير موجود");
    await this.logActivity(tenantId, userId, id, "note", body);
    return { ok: true };
  }

  private notifyAssignee(tenantId: string, assigneeId: string, ref: string | null, subject: string | null) {
    return this.notifications.notifyUser(tenantId, assigneeId, "staff_service_assigned", { ref: ref ?? "—", subject: subject ?? "—" }).catch(() => undefined);
  }

  private logActivity(tenantId: string, userId: string, entityId: string, type: string, body: string) {
    return this.prisma.crmActivity.create({ data: { tenantId, entityType: "service", entityId, type, body, authorId: userId } });
  }
}
