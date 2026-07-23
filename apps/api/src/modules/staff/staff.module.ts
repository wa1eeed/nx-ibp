import { Module } from "@nestjs/common";
import { StaffController } from "./staff.controller";
import { RolesController } from "./roles.controller";
import { StaffService } from "./staff.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { HrModule } from "../hr/hr.module";

@Module({
  imports: [NotificationsModule, HrModule],
  controllers: [StaffController, RolesController],
  providers: [StaffService],
})
export class StaffModule {}
