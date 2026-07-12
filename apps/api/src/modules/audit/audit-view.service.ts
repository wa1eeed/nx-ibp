import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RequestContextService } from "../../common/request-context/request-context.service";

export interface AuditRow {
  id: string;
  tenantId: string;
  actor: string; // اسم المنفّذ (مُحوَّل من userId) أو تسمية خاصة
  action: string;
  entity: string;
  entityId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  meta: unknown;
  createdAt: Date;
}

export interface AuditFilter {
  action?: string;
  entity?: string;
  limit?: number;
}

const SPECIAL: Record<string, string> = { system: "النظام", platform: "المنصّة", seed: "البذرة" };

/**
 * عرض سجل التدقيق الثابت بأسماء المنفّذين (تحويل `userId` ⇒ اسم المستخدم). يُستخدم
 * للمستأجر (سجلّه فقط) وللسوبر أدمن (عابر). القراءة فقط — لا يعدّل السجل الثابت.
 */
@Injectable()
export class AuditViewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContextService,
  ) {}

  /** سجل تدقيق المستأجر الحالي (مفلتَر بالمستأجر عبر middleware) — بأسماء المنفّذين. */
  async listForTenant(filter: AuditFilter): Promise<AuditRow[]> {
    const where: Record<string, unknown> = {};
    if (filter.action) where.action = filter.action;
    if (filter.entity) where.entity = filter.entity;
    const limit = Math.min(Math.max(1, filter.limit ?? 150), 500);
    const rows = await this.prisma.auditLog.findMany({
      where, orderBy: { createdAt: "desc" }, take: limit,
      select: { id: true, tenantId: true, userId: true, action: true, entity: true, entityId: true, ipAddress: true, userAgent: true, meta: true, createdAt: true },
    });
    return this.resolve(rows);
  }

  /** سجل التدقيق عابر المستأجرين (للسوبر أدمن) — يُنفَّذ بلا سياق مستأجر. */
  async listForPlatform(filter: AuditFilter & { tenantId?: string }): Promise<AuditRow[]> {
    return this.ctx.run({}, async () => {
      const where: Record<string, unknown> = {};
      if (filter.tenantId) where.tenantId = filter.tenantId;
      if (filter.action) where.action = filter.action;
      if (filter.entity) where.entity = filter.entity;
      const limit = Math.min(Math.max(1, filter.limit ?? 200), 1000);
      const rows = await this.prisma.auditLog.findMany({
        where, orderBy: { createdAt: "desc" }, take: limit,
        select: { id: true, tenantId: true, userId: true, action: true, entity: true, entityId: true, ipAddress: true, userAgent: true, meta: true, createdAt: true },
      });
      return this.resolve(rows);
    });
  }

  /** يحوّل معرّفات المنفّذين إلى أسماء (دفعة واحدة) — مع تسميات خاصة للنظام/المنصّة. */
  private async resolve(rows: Array<{ userId: string | null } & Omit<AuditRow, "actor">>): Promise<AuditRow[]> {
    const ids = [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x && !(x in SPECIAL)))];
    const users = ids.length
      ? await this.ctx.run({}, async () => await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }))
      : [];
    const nameById = new Map(users.map((u) => [u.id, u.fullName]));
    return rows.map((r) => ({
      id: r.id, tenantId: r.tenantId,
      actor: !r.userId ? "—" : (SPECIAL[r.userId] ?? nameById.get(r.userId) ?? "غير معروف"),
      action: r.action, entity: r.entity, entityId: r.entityId, ipAddress: r.ipAddress, userAgent: r.userAgent, meta: r.meta, createdAt: r.createdAt,
    }));
  }
}
