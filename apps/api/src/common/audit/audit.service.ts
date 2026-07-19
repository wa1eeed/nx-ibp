import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@ibp/db";
import { PrismaService } from "../../prisma/prisma.service";
import { RequestContextService } from "../request-context/request-context.service";

export interface AuditParams {
  action: string; // login | create | update | delete | file_url | verify | approve ...
  entity: string;
  entityId?: string;
  /** يُمرَّر صراحةً عند غياب سياق المستأجر (مثل تسجيل الدخول). */
  tenantId?: string;
  userId?: string | null;
  /** لقطتا الحالة قبل/بعد التغيير (للعمليات ذات الحالة — تدقيق كامل). */
  oldValues?: Prisma.InputJsonValue;
  newValues?: Prisma.InputJsonValue;
  meta?: Prisma.InputJsonValue;
}

/**
 * سجل التدقيق (Audit Trail) — مطلب تنظيمي (هيئة التأمين/PDPL).
 * يُسجَّل كل عملية حسّاسة (GUIDELINES.md §7 #5). فشل التدقيق لا يُفشل العملية الأصلية.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContextService,
  ) {}

  async log(p: AuditParams): Promise<void> {
    const tenantId = p.tenantId ?? this.ctx.tenantId;
    if (!tenantId) return;
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          userId: p.userId ?? this.ctx.userId ?? null,
          role: this.ctx.roleId ?? null, // هوية الفاعل الكاملة (الدور وقت العملية)
          sessionId: this.ctx.sessionId ?? null, // ربط عمليات الجلسة الواحدة
          action: p.action,
          entity: p.entity,
          entityId: p.entityId ?? null,
          ipAddress: this.ctx.ip ?? null, // مَن/من أي جهاز (مطلب NCA ECC)
          userAgent: this.ctx.userAgent ?? null,
          ...(p.oldValues !== undefined ? { oldValues: p.oldValues } : {}),
          ...(p.newValues !== undefined ? { newValues: p.newValues } : {}),
          ...(p.meta !== undefined ? { meta: p.meta } : {}),
        },
      });
    } catch (e) {
      this.logger.warn(`تعذّر تسجيل التدقيق (${p.action}/${p.entity}): ${(e as Error).message}`);
    }
  }
}
