import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { RequestsService } from "./requests.service";
import { CreateRequestDto } from "./dto/create-request.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

@Controller("requests")
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Authorize({ module: "sales", action: "read", entitlement: "module.sales" })
  @Get()
  list(@CurrentUser("userId") userId: string) {
    return this.requests.list(userId);
  }

  @Authorize({ module: "sales", action: "create", entitlement: "module.sales" })
  @Post()
  create(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Body() dto: CreateRequestDto,
  ) {
    return this.requests.create(tenantId, userId, dto);
  }

  @Authorize({ module: "sales", action: "read", entitlement: "module.sales" })
  @Get(":id")
  getOne(@Param("id") id: string) {
    return this.requests.getOne(id);
  }
}
