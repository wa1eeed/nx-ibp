import { Body, Controller, Get, Param, Post, Put } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { UpdateNotificationDto } from "./dto/notification.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

/** إعدادات إشعارات الشركة + مركز الإشعارات داخل المنصة (in-app) للموظف. */
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  // ——— الإعدادات (مالك الحساب — تحت settings) ———
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

  // ——— مركز الإشعارات (كل موظف يرى إشعاراته — مصادقة فقط بلا صلاحية وحدة) ———
  @Get("inbox")
  inbox(@CurrentUser("userId") userId: string) {
    return this.notifications.inboxStaff(userId);
  }

  @Get("inbox/unread-count")
  unread(@CurrentUser("userId") userId: string) {
    return this.notifications.unreadStaff(userId);
  }

  @Post("inbox/read-all")
  readAll(@CurrentUser("userId") userId: string) {
    return this.notifications.markAllReadStaff(userId);
  }

  @Post("inbox/:id/read")
  read(@CurrentUser("userId") userId: string, @Param("id") id: string) {
    return this.notifications.markReadStaff(userId, id);
  }
}
