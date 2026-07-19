import { Module } from "@nestjs/common";
import { StaffController } from "./staff.controller";
import { RolesController } from "./roles.controller";
import { StaffService } from "./staff.service";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [StaffController, RolesController],
  providers: [StaffService],
})
export class StaffModule {}
