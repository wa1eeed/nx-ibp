import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { IsIn, IsISO8601, IsNumber, IsString, Min, MinLength } from "class-validator";
import { TargetsService } from "./targets.service";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

class CreateTargetDto {
  @IsIn(["producer", "line"]) scope!: "producer" | "line";
  @IsString() @MinLength(1) scopeRefId!: string;
  @IsIn(["premium", "policies", "commissions"]) metric!: "premium" | "policies" | "commissions";
  @IsIn(["month", "quarter", "year"]) period!: "month" | "quarter" | "year";
  @IsISO8601() periodStart!: string;
  @IsNumber() @Min(0.01) targetValue!: number;
}

/** أهداف الأداء (P1-B) — تحت التقارير/الرؤى. الإنشاء إشرافي (reports:create). */
@Controller("targets")
export class TargetsController {
  constructor(private readonly targets: TargetsService) {}

  @Authorize({ module: "reports", action: "read", entitlement: "module.reports" })
  @Get()
  list(@CurrentUser("tenantId") tenantId: string, @Query("period") period?: string) {
    return this.targets.list(tenantId, { period });
  }

  @Authorize({ module: "reports", action: "read", entitlement: "module.reports" })
  @Get("options")
  options(@CurrentUser("tenantId") tenantId: string) {
    return this.targets.options(tenantId);
  }

  @Authorize({ module: "reports", action: "create", entitlement: "module.reports" })
  @Post()
  create(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Body() dto: CreateTargetDto) {
    return this.targets.create(tenantId, userId, dto);
  }

  @Authorize({ module: "reports", action: "delete", entitlement: "module.reports" })
  @Delete(":id")
  remove(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Param("id") id: string) {
    return this.targets.remove(tenantId, userId, id);
  }
}
