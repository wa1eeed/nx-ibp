import { Body, Controller, Get, HttpCode, Post, Query } from "@nestjs/common";
import { VerificationService } from "./verification.service";
import { YaqeenDto, WathiqDto, AddressDto, ScreeningDto, CrRegistryDto } from "./dto/verification.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

/**
 * التحقّق الحكومي (KYC/KYB). سحب البيانات أثناء التهيئة (clients)؛
 * فحص PEP/العقوبات للالتزام (compliance).
 */
@Controller("verification")
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Authorize({ module: "clients", action: "update", entitlement: "feature.verification" })
  @HttpCode(200)
  @Post("yaqeen")
  yaqeen(@CurrentUser("tenantId") t: string, @CurrentUser("userId") u: string, @Body() dto: YaqeenDto) {
    return this.verification.yaqeen(t, u, dto.nationalId, dto.clientId);
  }

  @Authorize({ module: "clients", action: "update", entitlement: "feature.verification" })
  @HttpCode(200)
  @Post("wathiq")
  wathiq(@CurrentUser("tenantId") t: string, @CurrentUser("userId") u: string, @Body() dto: WathiqDto) {
    return this.verification.wathiq(t, u, dto.crNumber, dto.clientId);
  }

  @Authorize({ module: "clients", action: "update", entitlement: "feature.verification" })
  @HttpCode(200)
  @Post("address")
  address(@CurrentUser("tenantId") t: string, @CurrentUser("userId") u: string, @Body() dto: AddressDto) {
    return this.verification.address(t, u, dto.id, dto.clientId);
  }

  // فحص PEP/العقوبات — صلاحية الالتزام + ميزة التحقّق في الباقة
  @Authorize({ module: "compliance", action: "update", entitlement: "feature.verification" })
  @HttpCode(200)
  @Post("screening")
  screening(@CurrentUser("tenantId") t: string, @CurrentUser("userId") u: string, @Body() dto: ScreeningDto) {
    return this.verification.screening(t, u, dto.name, dto.clientId);
  }

  // التحقّق من السجل التجاري عبر «البيانات المفتوحة» لوزارة التجارة (بحث محليّ فوريّ برقم السجل، مجاني)
  @Authorize({ module: "clients", action: "update", entitlement: "feature.verification" })
  @HttpCode(200)
  @Post("cr-registry")
  crRegistry(@CurrentUser("tenantId") t: string, @CurrentUser("userId") u: string, @Body() dto: CrRegistryDto) {
    return this.verification.crRegistry_lookup(t, u, dto.crNumber, dto.clientId);
  }

  @Authorize({ module: "clients", action: "read", entitlement: "feature.verification" })
  @Get("cr-registry/meta")
  crRegistryMeta() {
    return this.verification.crRegistryMeta();
  }

  @Authorize({ module: "clients", action: "read", entitlement: "feature.verification" })
  @Get("wallets")
  wallets() {
    return this.verification.wallets();
  }

  @Authorize({ module: "clients", action: "read", entitlement: "feature.verification" })
  @Get("checks")
  checks(@Query("clientId") clientId?: string) {
    return this.verification.checks(clientId);
  }
}
