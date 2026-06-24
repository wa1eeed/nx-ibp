import { Controller, Get } from "@nestjs/common";
import { ComplianceService } from "./compliance.service";
import { Authorize } from "../rbac/authorize.decorator";

/** لوحة الالتزام — صلاحية compliance:read + entitlement module.compliance. */
@Controller("compliance")
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  @Authorize({ module: "compliance", action: "read", entitlement: "module.compliance" })
  @Get("overview")
  overview() {
    return this.compliance.overview();
  }
}
