import { Module } from "@nestjs/common";
import { AmlController } from "./aml.controller";
import { AmlService } from "./aml.service";
import { NotificationsModule } from "../notifications/notifications.module";

/** مكافحة غسل الأموال (AML/CFT — §6.2، امتثال ترخيصي). */
@Module({
  imports: [NotificationsModule],
  controllers: [AmlController],
  providers: [AmlService],
})
export class AmlModule {}
