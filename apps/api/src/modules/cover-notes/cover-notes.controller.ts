import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { CoverNotesService } from "./cover-notes.service";
import { IssueCoverNoteDto } from "./dto/cover-note.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

/** مذكرة التغطية المؤقتة (§4.2) — تحت صلاحية الإنتاج (`production`). */
@Controller("cover-notes")
export class CoverNotesController {
  constructor(private readonly cover: CoverNotesService) {}

  @Authorize({ module: "production", action: "read", entitlement: "module.production" })
  @Get()
  list() {
    return this.cover.list();
  }

  @Authorize({ module: "production", action: "create", entitlement: "module.production" })
  @HttpCode(201)
  @Post()
  issue(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Body() dto: IssueCoverNoteDto) {
    return this.cover.issue(tenantId, userId, dto.requestId, dto);
  }

  @Authorize({ module: "production", action: "read", entitlement: "module.production" })
  @Get(":id")
  detail(@Param("id") id: string) {
    return this.cover.detail(id);
  }

  @Authorize({ module: "production", action: "read", entitlement: "module.production" })
  @Get(":id/document")
  document(@CurrentUser("tenantId") tenantId: string, @Param("id") id: string) {
    return this.cover.document(tenantId, id);
  }

  @Authorize({ module: "production", action: "update", entitlement: "module.production" })
  @HttpCode(200)
  @Post(":id/cancel")
  cancel(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Param("id") id: string) {
    return this.cover.cancel(tenantId, userId, id);
  }
}
