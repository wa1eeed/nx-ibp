import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { ServiceService } from "./service.service";
import { CreateServiceRequestDto, UpdateServiceStatusDto } from "./dto/service.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

@Controller("service-requests")
export class ServiceController {
  constructor(private readonly service: ServiceService) {}

  @Authorize({ module: "service", action: "read", entitlement: "module.service" })
  @Get()
  list() {
    return this.service.list();
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
}
