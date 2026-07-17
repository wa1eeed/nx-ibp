import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { ComplaintsService } from "./complaints.service";
import { CreateComplaintDto, UpdateComplaintDto, ResolveComplaintDto, ComplaintNoteDto } from "./dto/complaint.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

/** سجلّ الشكاوى (§6.1) — تحت صلاحية الالتزام (`compliance`). */
@Controller("complaints")
export class ComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Authorize({ module: "compliance", action: "read" })
  @Get()
  list(@Query("status") status?: string, @Query("category") category?: string) {
    return this.complaints.list({ status, category });
  }

  @Authorize({ module: "compliance", action: "read" })
  @Get("report")
  report() {
    return this.complaints.report();
  }

  @Authorize({ module: "compliance", action: "create" })
  @HttpCode(201)
  @Post()
  create(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Body() dto: CreateComplaintDto) {
    return this.complaints.create(tenantId, userId, dto);
  }

  @Authorize({ module: "compliance", action: "read" })
  @Get(":id")
  detail(@Param("id") id: string) {
    return this.complaints.detail(id);
  }

  @Authorize({ module: "compliance", action: "update" })
  @Put(":id")
  update(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Param("id") id: string, @Body() dto: UpdateComplaintDto) {
    return this.complaints.update(tenantId, userId, id, dto);
  }

  @Authorize({ module: "compliance", action: "update" })
  @HttpCode(200)
  @Post(":id/resolve")
  resolve(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Param("id") id: string, @Body() dto: ResolveComplaintDto) {
    return this.complaints.resolve(tenantId, userId, id, dto.resolution);
  }

  @Authorize({ module: "compliance", action: "update" })
  @HttpCode(200)
  @Post(":id/escalate")
  escalate(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Param("id") id: string) {
    return this.complaints.escalate(tenantId, userId, id);
  }

  @Authorize({ module: "compliance", action: "update" })
  @HttpCode(201)
  @Post(":id/notes")
  addNote(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Param("id") id: string, @Body() dto: ComplaintNoteDto) {
    return this.complaints.addNote(tenantId, userId, id, dto.body);
  }
}
