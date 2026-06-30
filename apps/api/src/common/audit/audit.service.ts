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
          action: p.action,
          entity: p.entity,
          entityId: p.entityId ?? null,
          ...(p.meta !== undefined ? { meta: p.meta } : {}),
        },
      });
    } catch (e) {
      this.logger.warn(`تعذّر تسجيل التدقيق (${p.action}/${p.entity}): ${(e as Error).message}`);
    }
  }
}
