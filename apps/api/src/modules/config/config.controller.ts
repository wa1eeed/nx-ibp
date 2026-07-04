import { Body, Controller, Get, Put } from "@nestjs/common";
import { IsBoolean, IsInt, Max, Min } from "class-validator";
import { ConfigService, type ApprovalStep } from "./config.service";
import { SetApprovalChainDto } from "./dto/approval-chain.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

class SetSecurityDto {
  @IsBoolean() mfaRequired!: boolean;
}

class SetRetentionDto {
  @IsInt() @Min(1) @Max(30) retentionYears!: number;
}

/** إعدادات المستأجر القابلة للتهيئة — سلسلة اعتماد الوثيقة (E2). تحت الإعدادات. */
@Controller("config")
export class ConfigController {
  constructor(private readonly config: ConfigService) {}

  @Authorize({ module: "settings", action: "read" })
  @Get("approval-chain")
  get(@CurrentUser("tenantId") tenantId: string) {
    return this.config.getPolicyApprovalConfig(tenantId).then((c) => ({ technicalGate: c.technicalGate, segregationOfDuties: c.segregationOfDuties, steps: c.extraSteps }));
  }

  @Authorize({ module: "settings", action: "update" })
  @Put("approval-chain")
  set(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Body() dto: SetApprovalChainDto) {
    return this.config.setPolicyApprovalConfig(tenantId, userId, { technicalGate: dto.technicalGate, segregationOfDuties: dto.segregationOfDuties, steps: dto.steps as ApprovalStep[] });
  }

  // ——— سياسة الأمان (إلزام المصادقة الثنائية للموظفين) ———
  @Authorize({ module: "settings", action: "read" })
  @Get("security")
  getSecurity(@CurrentUser("tenantId") tenantId: string) {
    return this.config.getSecurityConfig(tenantId);
  }

  @Authorize({ module: "settings", action: "update" })
  @Put("security")
  setSecurity(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Body() dto: SetSecurityDto) {
    return this.config.setSecurityConfig(tenantId, userId, { mfaRequired: dto.mfaRequired });
  }

  // ——— سياسة الاحتفاظ بالبيانات (PDPL/الإتلاف الآمن) ———
  @Authorize({ module: "settings", action: "read" })
  @Get("retention")
  getRetention(@CurrentUser("tenantId") tenantId: string) {
    return this.config.getRetentionConfig(tenantId);
  }

  @Authorize({ module: "settings", action: "update" })
  @Put("retention")
  setRetention(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Body() dto: SetRetentionDto) {
    return this.config.setRetentionConfig(tenantId, userId, { retentionYears: dto.retentionYears });
  }
}
