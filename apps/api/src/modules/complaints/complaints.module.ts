import { Module } from "@nestjs/common";
import { ComplaintsController } from "./complaints.controller";
import { ComplaintsService } from "./complaints.service";
import { NotificationsModule } from "../notifications/notifications.module";

/** سجلّ الشكاوى (§6.1 — امتثال هيئة التأمين). */
@Module({
  imports: [NotificationsModule],
  controllers: [ComplaintsController],
  providers: [ComplaintsService],
})
export class ComplaintsModule {}
