import { Module } from "@nestjs/common";
import { RemindersService } from "./reminders.service";
import { RemindersController } from "./reminders.controller";
import { NotificationsModule } from "../notifications/notifications.module";
import { ReportsModule } from "../reports/reports.module";

/** مجدول التذكيرات الدورية (مهام CRM + تجديد الوثائق + التقارير المجدولة §7.3). */
@Module({
  imports: [NotificationsModule, ReportsModule],
  controllers: [RemindersController],
  providers: [RemindersService],
  exports: [RemindersService],
})
export class RemindersModule {}
