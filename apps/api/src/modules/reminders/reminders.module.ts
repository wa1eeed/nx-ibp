import { Module } from "@nestjs/common";
import { RemindersService } from "./reminders.service";
import { RemindersController } from "./reminders.controller";
import { NotificationsModule } from "../notifications/notifications.module";

/** مجدول التذكيرات الدورية (مهام CRM المستحقّة + تجديد الوثائق). */
@Module({
  imports: [NotificationsModule],
  controllers: [RemindersController],
  providers: [RemindersService],
  exports: [RemindersService],
})
export class RemindersModule {}
