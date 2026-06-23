import { Controller, Get } from "@nestjs/common";
import { ClaimsService } from "./claims.service";
import { Authorize } from "../rbac/authorize.decorator";

@Controller("claims")
export class ClaimsController {
  constructor(private readonly claims: ClaimsService) {}

  // فحص مزدوج: الموديول مفعّل في الباقة (module.claims) + صلاحية الدور (claims:read)
  @Authorize({ module: "claims", action: "read", entitlement: "module.claims" })
  @Get()
  list() {
    return this.claims.list();
  }
}
