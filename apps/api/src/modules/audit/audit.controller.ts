import { Controller, Get, Query } from "@nestjs/common";
import { AuditViewService } from "./audit-view.service";
import { Authorize } from "../rbac/authorize.decorator";

/**
 * سجل تدقيق الشركة (للمستأجر) — «من فعل ماذا ومتى». صلاحية الالتزام (compliance:read)،
 * فمسؤول الالتزام/الإدارة يراجع كل العمليات الحسّاسة. قراءة فقط (السجل ثابت).
 */
@Controller("audit")
export class AuditController {
  constructor(private readonly audit: AuditViewService) {}

  @Authorize({ module: "compliance", action: "read" })
  @Get()
  list(@Query("action") action?: string, @Query("entity") entity?: string, @Query("limit") limit?: string) {
    return this.audit.listForTenant({ action, entity, limit: limit ? Number(limit) : undefined });
  }
}
