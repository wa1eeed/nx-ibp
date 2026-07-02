import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { UpdateNotificationDto } from "./dto/notification.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

/** إعدادات إشعارات الشركة (مالك الحساب) — تحت الإعدادات. */
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Authorize({ module: "settings", action: "read" })
  @Get()
  list(@CurrentUser("tenantId") tenantId: string) {
    return this.notifications.list(tenantId);
  }

  @Authorize({ module: "settings", action: "update" })
  @Put(":key")
  update(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Param("key") key: string, @Body() dto: UpdateNotificationDto) {
    return this.notifications.update(tenantId, userId, key, dto);
  }
}
