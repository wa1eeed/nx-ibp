import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { LEAVE_TYPES, type CreateLeaveDto, type DecideLeaveDto } from "./dto/leave.dto";

const DAY = 86_400_000;

/**
 * §8.2 — طلبات إجازات الموظفين بدورة اعتماد (معلّق → موافَق/مرفوض). طبقة HR خفيفة ضمن نطاق
 * الوساطة؛ الحضور/البصمة وتعمّق الـHRIS خارج النطاق (يُكامَل مع نظام موارد بشرية مختصّ).
 * معزولة بالمستأجر: الموظف يقدّم/يرى طلباته؛ الإدارة (settings) تراها وتبتّها (لا يبتّ الموظف طلبه).
 */
@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private map = (r: { id: string; userId: string; employeeName: string; type: string; startDate: Date; endDate: Date; days: number; reason: string | null; status: string; decidedBy: string | null; decidedAt: Date | null; decisionNote: string | null; createdAt: Date }) => ({
    id: r.id, userId: r.userId, employeeName: r.employeeName, type: r.type,
    startDate: r.startDate.toISOString().slice(0, 10), endDate: r.endDate.toISOString().slice(0, 10),
    days: r.days, reason: r.reason, status: r.status, decidedAt: r.decidedAt, decisionNote: r.decisionNote, createdAt: r.createdAt,
  });

  /** طلبات الموظف الحالي (أحدث أولًا). */
  async mine(userId: string) {
    return (await this.prisma.leaveRequest.findMany({ where: { userId }, orderBy: { createdAt: "desc" } })).map(this.map);
  }

  /** كل الطلبات (للإدارة) — معزولة بالمستأجر، اختياريًا بالحالة. */
  async list(status?: string) {
    const where = status && ["pending", "approved", "rejected"].includes(status) ? { status } : {};
    return (await this.prisma.leaveRequest.findMany({ where, orderBy: { createdAt: "desc" } })).map(this.map);
  }

  /** تقديم طلب إجازة (الموظف نفسه). عدد الأيام يشمل الطرفين. */
  async create(tenantId: string, userId: string, dto: CreateLeaveDto) {
    if (!(LEAVE_TYPES as readonly string[]).includes(dto.type)) throw new BadRequestException("نوع إجازة غير معروف");
    const start = new Date(dto.startDate), end = new Date(dto.endDate);
    if (Number.isNaN(+start) || Number.isNaN(+end)) throw new BadRequestException("تاريخ غير صالح");
    if (+end < +start) throw new BadRequestException("تاريخ النهاية قبل البداية");
    const days = Math.round((+end - +start) / DAY) + 1;
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId }, select: { fullName: true } });
    const r = await this.prisma.leaveRequest.create({
      data: { tenantId, userId, employeeName: user?.fullName ?? "—", type: dto.type, startDate: start, endDate: end, days, reason: dto.reason?.trim() || null },
    });
    await this.audit.log({ tenantId, userId, action: "create", entity: "leave_request", entityId: r.id, meta: { type: dto.type, days } });
    return this.map(r);
  }

  /** بتّ الطلب (الإدارة) — معلّق فقط، ولا يبتّ الموظف طلبه (فصل مهام). */
  async decide(tenantId: string, actorId: string, id: string, dto: DecideLeaveDto) {
    const r = await this.prisma.leaveRequest.findFirst({ where: { id } });
    if (!r) throw new NotFoundException("طلب الإجازة غير موجود");
    if (r.status !== "pending") throw new ConflictException("الطلب مبتوت مسبقًا");
    if (r.userId === actorId) throw new ForbiddenException("لا يبتّ الموظف طلب إجازته (فصل مهام)");
    await this.prisma.leaveRequest.update({ where: { id }, data: { status: dto.status, decidedBy: actorId, decidedAt: new Date(), decisionNote: dto.note?.trim() || null } });
    await this.audit.log({ tenantId, userId: actorId, action: "update", entity: "leave_request", entityId: id, meta: { status: dto.status } });
    return { ok: true, status: dto.status };
  }
}
