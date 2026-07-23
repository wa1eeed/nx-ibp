import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { ClaimsService } from "./claims.service";
import { CreateClaimDto, UpdateClaimStatusDto, ClaimNoteDto, SendInsurerDto } from "./dto/claim.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";

@Controller("claims")
export class ClaimsController {
  constructor(private readonly claims: ClaimsService) {}

  // فحص مزدوج: الموديول مفعّل في الباقة (module.claims) + صلاحية الدور
  @Authorize({ module: "claims", action: "read", entitlement: "module.claims" })
  @Get()
  list() {
    return this.claims.list();
  }

  @Authorize({ module: "claims", action: "create", entitlement: "module.claims" })
  @Post()
  create(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Body() dto: CreateClaimDto,
  ) {
    return this.claims.create(tenantId, userId, dto);
  }

  @Authorize({ module: "claims", action: "update", entitlement: "module.claims" })
  @HttpCode(200)
  @Post(":id/status")
  setStatus(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Param("id") id: string,
    @Body() dto: UpdateClaimStatusDto,
  ) {
    return this.claims.setStatus(tenantId, userId, id, dto.status, dto.settledAmount);
  }

  @Authorize({ module: "claims", action: "read", entitlement: "module.claims" })
  @Get(":id")
  detail(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.claims.detail(id, user);
  }

  @Authorize({ module: "claims", action: "update", entitlement: "module.claims" })
  @HttpCode(201)
  @Post(":id/notes")
  addNote(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Param("id") id: string,
    @Body() dto: ClaimNoteDto,
  ) {
    return this.claims.addNote(tenantId, userId, id, dto.body, dto.visibility ?? "internal");
  }

  // مراسلة شركة التأمين — تفاصيل/متابعة المطالبة (معاينة ثم إرسال)
  @Authorize({ module: "claims", action: "read", entitlement: "module.claims" })
  @Get(":id/insurer-letter")
  insurerLetter(@Param("id") id: string) {
    return this.claims.insurerLetter(id);
  }

  @Authorize({ module: "claims", action: "update", entitlement: "module.claims" })
  @HttpCode(200)
  @Post(":id/send-insurer")
  sendInsurer(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Param("id") id: string,
    @Body() dto: SendInsurerDto,
  ) {
    return this.claims.sendToInsurer(tenantId, userId, id, dto);
  }
}
