import { Module } from "@nestjs/common";
import { ProductionController } from "./production.controller";
import { ProductionService } from "./production.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { ConfigModule } from "../config/config.module";
import { ProductScopeModule } from "../../common/scope/product-scope.module";

@Module({
  imports: [NotificationsModule, ConfigModule, ProductScopeModule], // إشعار العميل + سلسلة الاعتماد (E2). PermissionService عالمي.
  controllers: [ProductionController],
  providers: [ProductionService],
})
export class ProductionModule {}
