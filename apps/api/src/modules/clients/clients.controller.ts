import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post } from "@nestjs/common";
import { ClientsService } from "./clients.service";
import { CreateClientDto } from "./dto/create-client.dto";
import { ComplianceDto } from "./dto/compliance.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

@Controller("clients")
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Authorize({ module: "clients", action: "read", entitlement: "module.clients" })
  @Get()
  list() {
    return this.clients.list();
  }

  @Authorize({ module: "clients", action: "create", entitlement: "module.clients" })
  @Post()
  create(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Body() dto: CreateClientDto,
  ) {
    return this.clients.create(tenantId, userId, dto);
  }

  // بوّابة الالتزام — صلاحية موديول compliance (المدير العام/مدير الالتزام)
  @Authorize({ module: "compliance", action: "update" })
  @HttpCode(200)
  @Post(":id/compliance")
  compliance(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Param("id") id: string,
    @Body() dto: ComplianceDto,
  ) {
    return this.clients.setCompliance(tenantId, userId, id, dto.decision, dto.note);
  }

  @Authorize({ module: "clients", action: "read", entitlement: "module.clients" })
  @Get(":id")
  async getOne(@Param("id") id: string) {
    const client = await this.clients.getOne(id);
    if (!client) throw new NotFoundException("العميل غير موجود");
    return client;
  }

  // نظرة 360° مجمّعة (وثائق/مطالبات/طلبات/تحقّق/مالية/نشاط)
  @Authorize({ module: "clients", action: "read", entitlement: "module.clients" })
  @Get(":id/overview")
  overview(@Param("id") id: string) {
    return this.clients.overview(id);
  }
}
