import { Body, Controller, Get, HttpCode, Post, Put } from "@nestjs/common";
import { TenantEmailService } from "./tenant-email.service";
import { SaveEmailDto } from "./dto/email.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

/** إعدادات البريد الرسمي للمستأجر (BYO Resend + التحقّق) — تحت الإعدادات. */
@Controller("config/email")
export class EmailController {
  constructor(private readonly email: TenantEmailService) {}

  @Authorize({ module: "settings", action: "read" })
  @Get()
  get(@CurrentUser("tenantId") tenantId: string) {
    return this.email.get(tenantId);
  }

  @Authorize({ module: "settings", action: "update" })
  @Put()
  save(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Body() dto: SaveEmailDto) {
    return this.email.save(tenantId, userId, dto);
  }

  @Authorize({ module: "settings", action: "update" })
  @HttpCode(200)
  @Post("verify")
  verify(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string) {
    return this.email.verify(tenantId, userId);
  }
}
