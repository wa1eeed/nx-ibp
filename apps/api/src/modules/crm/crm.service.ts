import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import type { CreateDealDto, UpdateDealDto, CreateTaskDto, AddActivityDto } from "./dto/crm.dto";

/** مراحل خط أنابيب الصفقات (Pipeline). */
export const DEAL_STAGES = ["new", "contacted", "quoting", "proposal", "negotiation"] as const;

/**
 * إدارة علاقات العملاء (CRM): خط أنابيب الصفقات بمراحل + إسناد، مهام/تذكيرات قابلة للإسناد
 * تُطلق إشعارًا، وسجلّ نشاط/ملاحظات polymorphic (يخدم الخط الزمني). معزول بالمستأجر.
 */
@Injectable()
export class CrmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ————————————————— الصفقات (Pipeline) —————————————————
  async listDeals() {
    const deals = await this.prisma.deal.findMany({ where: { status: "open" }, orderBy: { updatedAt: "desc" } });
    return this.enrich(deals);
  }

  async createDeal(tenantId: string, userId: string, dto: CreateDealDto) {
    const deal = await this.prisma.deal.create({
      data: { tenantId, title: dto.title, clientId: dto.clientId ?? null, stage: dto.stage ?? "new", value: dto.value ?? null, productLineCode: dto.productLineCode ?? null, assigneeId: dto.assigneeId ?? null, createdById: userId },
    });
    await this.audit.log({ tenantId, userId, action: "create", entity: "deal", entityId: deal.id, meta: { title: deal.title } });
    await this.logActivity(tenantId, userId, "deal", deal.id, "note", "أُنشئت الصفقة");
    if (deal.assigneeId) void this.notifications.notifyUser(tenantId, deal.assigneeId, "staff_deal_assigned", { title: deal.title }).catch(() => undefined);
    return deal;
  }

  async updateDeal(tenantId: string, userId: string, id: string, dto: UpdateDealDto) {
    const before = await this.prisma.deal.findFirst({ where: { id } });
    if (!before) throw new NotFoundException("الصفقة غير موجودة");
    const deal = await this.prisma.deal.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.stage !== undefined ? { stage: dto.stage } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.value !== undefined ? { value: dto.value } : {}),
        ...(dto.assigneeId !== undefined ? { assigneeId: dto.assigneeId } : {}),
        ...(dto.lostReason !== undefined ? { lostReason: dto.lostReason } : {}),
      },
    });
    await this.audit.log({ tenantId, userId, action: "update", entity: "deal", entityId: id, meta: { stage: dto.stage, status: dto.status } });
    if (dto.stage && dto.stage !== before.stage) await this.logActivity(tenantId, userId, "deal", id, "stage_change", `نقل المرحلة إلى «${dto.stage}» (كانت «${before.stage}»)`);
    if (dto.status && dto.status !== before.status) await this.logActivity(tenantId, userId, "deal", id, "note", dto.status === "won" ? "كُسِبت الصفقة" : dto.status === "lost" ? `فُقِدت الصفقة${dto.lostReason ? ` — ${dto.lostReason}` : ""}` : `الحالة: ${dto.status}`);
    if (dto.assigneeId && dto.assigneeId !== before.assigneeId) void this.notifications.notifyUser(tenantId, dto.assigneeId, "staff_deal_assigned", { title: deal.title }).catch(() => undefined);
    return deal;
  }

  // ————————————————— المهام/التذكيرات —————————————————
  listTasks(mineUserId?: string) {
    return this.prisma.crmTask.findMany({
      where: { status: "open", ...(mineUserId ? { assigneeId: mineUserId } : {}) },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    });
  }

  async createTask(tenantId: string, userId: string, dto: CreateTaskDto) {
    const task = await this.prisma.crmTask.create({
      data: { tenantId, title: dto.title, assigneeId: dto.assigneeId ?? null, dueDate: dto.dueDate ? new Date(dto.dueDate) : null, priority: dto.priority ?? "normal", entityType: dto.entityType ?? null, entityId: dto.entityId ?? null, createdById: userId },
    });
    await this.audit.log({ tenantId, userId, action: "create", entity: "crm_task", entityId: task.id, meta: { title: task.title } });
    if (task.assigneeId) void this.notifications.notifyUser(tenantId, task.assigneeId, "staff_task_assigned", { title: task.title }).catch(() => undefined);
    return task;
  }

  async completeTask(tenantId: string, userId: string, id: string) {
    const task = await this.prisma.crmTask.findFirst({ where: { id } });
    if (!task) throw new NotFoundException("المهمة غير موجودة");
    await this.prisma.crmTask.update({ where: { id }, data: { status: "done", completedAt: new Date() } });
    await this.audit.log({ tenantId, userId, action: "update", entity: "crm_task", entityId: id, meta: { done: true } });
    return { ok: true };
  }

  // ————————————————— النشاط/الملاحظات (Timeline) —————————————————
  listActivities(entityType: string, entityId: string) {
    return this.prisma.crmActivity.findMany({ where: { entityType, entityId }, orderBy: { createdAt: "desc" }, take: 100 });
  }

  addActivity(tenantId: string, userId: string, dto: AddActivityDto) {
    return this.logActivity(tenantId, userId, dto.entityType, dto.entityId, dto.type ?? "note", dto.body);
  }

  private logActivity(tenantId: string, userId: string, entityType: string, entityId: string, type: string, body: string) {
    return this.prisma.crmActivity.create({ data: { tenantId, entityType, entityId, type, body, authorId: userId } });
  }

  /** يُثري الصفقات بأسماء العميل والمُسنَد (معزول بالمستأجر تلقائيًا). */
  private async enrich(deals: Array<{ clientId: string | null; assigneeId: string | null }>) {
    const clientIds = [...new Set(deals.map((d) => d.clientId).filter((x): x is string => !!x))];
    const userIds = [...new Set(deals.map((d) => d.assigneeId).filter((x): x is string => !!x))];
    const clients = clientIds.length ? await this.prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } }) : [];
    const users = userIds.length ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } }) : [];
    const cn = Object.fromEntries(clients.map((c) => [c.id, c.name]));
    const un = Object.fromEntries(users.map((u) => [u.id, u.fullName]));
    return deals.map((d) => ({ ...d, clientName: d.clientId ? cn[d.clientId] ?? null : null, assigneeName: d.assigneeId ? un[d.assigneeId] ?? null : null }));
  }
}
