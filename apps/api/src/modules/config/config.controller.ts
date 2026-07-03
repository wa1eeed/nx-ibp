import { Body, Controller, Get, Put } from "@nestjs/common";
import { ConfigService, type ApprovalStep } from "./config.service";
import { SetApprovalChainDto } from "./dto/approval-chain.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

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
}
