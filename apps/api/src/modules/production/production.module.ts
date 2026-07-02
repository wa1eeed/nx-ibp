import { Module } from "@nestjs/common";
import { ProductionController } from "./production.controller";
import { ProductionService } from "./production.service";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule], // إشعار العميل عند إصدار الوثيقة
  controllers: [ProductionController],
  providers: [ProductionService],
})
export class ProductionModule {}
