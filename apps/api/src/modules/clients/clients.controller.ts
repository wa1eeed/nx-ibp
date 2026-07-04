import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post } from "@nestjs/common";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { ClientsService } from "./clients.service";
import { CreateClientDto } from "./dto/create-client.dto";
import { ComplianceDto } from "./dto/compliance.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";

class EraseDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

@Controller("clients")
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Authorize({ module: "clients", action: "read", entitlement: "module.clients" })
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.clients.list(user);
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

  // ——— الاحتفاظ والإتلاف الآمن (PDPL) — تُعرَّف قبل ":id" كي لا يبتلعها المسار الديناميكي ———
  @Authorize({ module: "clients", action: "read", entitlement: "module.clients" })
  @Get("erasures")
  erasures() {
    return this.clients.erasures();
  }

  @Authorize({ module: "clients", action: "read", entitlement: "module.clients" })
  @Get("retention/due")
  retentionDue(@CurrentUser("tenantId") tenantId: string) {
    return this.clients.retentionDue(tenantId);
  }

  // محو بيانات العميل (حق المحو) — صلاحية حذف العملاء (إجراء عالي الامتياز)
  @Authorize({ module: "clients", action: "delete", entitlement: "module.clients" })
  @HttpCode(200)
  @Post(":id/erase")
  erase(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: EraseDto) {
    return this.clients.erase(user, id, dto.reason);
  }

  @Authorize({ module: "clients", action: "read", entitlement: "module.clients" })
  @Get(":id")
  async getOne(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const client = await this.clients.getOne(id, user);
    if (!client) throw new NotFoundException("العميل غير موجود");
    return client;
  }

  // نظرة 360° مجمّعة (وثائق/مطالبات/طلبات/تحقّق/مالية/نشاط)
  @Authorize({ module: "clients", action: "read", entitlement: "module.clients" })
  @Get(":id/overview")
  overview(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.clients.overview(id, user);
  }
}
