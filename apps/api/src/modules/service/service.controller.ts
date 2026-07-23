import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { ServiceService } from "./service.service";
import { CreateServiceRequestDto, UpdateServiceStatusDto, AssignServiceDto, ServicePriorityDto, ServiceNoteDto, SendInsurerDto } from "./dto/service.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";

@Controller("service-requests")
export class ServiceController {
  constructor(private readonly service: ServiceService) {}

  @Authorize({ module: "service", action: "read", entitlement: "module.service" })
  @Get()
  list(
    @CurrentUser("userId") userId: string,
    @Query("status") status?: string,
    @Query("assigneeId") assigneeId?: string,
    @Query("mine") mine?: string,
  ) {
    return this.service.list({ status, assigneeId, mine: mine === "1" }, userId);
  }

  @Authorize({ module: "service", action: "read", entitlement: "module.service" })
  @Get("staff")
  staff() {
    return this.service.assignableStaff();
  }

  @Authorize({ module: "service", action: "read", entitlement: "module.service" })
  @Get(":id")
  detail(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.detail(id, user);
  }

  @Authorize({ module: "service", action: "create", entitlement: "module.service" })
  @Post()
  create(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Body() dto: CreateServiceRequestDto,
  ) {
    return this.service.create(tenantId, userId, dto);
  }

  @Authorize({ module: "service", action: "update", entitlement: "module.service" })
  @HttpCode(200)
  @Post(":id/status")
  setStatus(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Param("id") id: string,
    @Body() dto: UpdateServiceStatusDto,
  ) {
    return this.service.setStatus(tenantId, userId, id, dto.status);
  }

  @Authorize({ module: "service", action: "update", entitlement: "module.service" })
  @HttpCode(200)
  @Post(":id/assign")
  assign(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Param("id") id: string,
    @Body() dto: AssignServiceDto,
  ) {
    return this.service.assign(tenantId, userId, id, dto.assigneeId ?? null);
  }

  @Authorize({ module: "service", action: "update", entitlement: "module.service" })
  @HttpCode(200)
  @Post(":id/priority")
  setPriority(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Param("id") id: string,
    @Body() dto: ServicePriorityDto,
  ) {
    return this.service.setPriority(tenantId, userId, id, dto.priority);
  }

  @Authorize({ module: "service", action: "update", entitlement: "module.service" })
  @HttpCode(201)
  @Post(":id/notes")
  addNote(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Param("id") id: string,
    @Body() dto: ServiceNoteDto,
  ) {
    return this.service.addNote(tenantId, userId, id, dto.body, dto.visibility ?? "internal");
  }

  // مراسلة شركة التأمين — خطاب طلب التعديل (معاينة الصيغة ثم إرسال)
  @Authorize({ module: "service", action: "read", entitlement: "module.service" })
  @Get(":id/insurer-letter")
  insurerLetter(@Param("id") id: string) {
    return this.service.insurerLetter(id);
  }

  @Authorize({ module: "service", action: "update", entitlement: "module.service" })
  @HttpCode(200)
  @Post(":id/send-insurer")
  sendInsurer(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Param("id") id: string,
    @Body() dto: SendInsurerDto,
  ) {
    return this.service.sendToInsurer(tenantId, userId, id, dto);
  }
}
