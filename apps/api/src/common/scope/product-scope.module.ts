import { Module } from "@nestjs/common";
import { ProductScopeService } from "./product-scope.service";

/** وحدة نطاق المنتجات — تُصدِّر الخدمة لاستهلاكها في الطلبات/الإنتاج/الاكتتاب. */
@Module({
  providers: [ProductScopeService],
  exports: [ProductScopeService],
})
export class ProductScopeModule {}
