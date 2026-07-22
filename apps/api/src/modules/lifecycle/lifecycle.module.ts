import { Global, Module } from "@nestjs/common";
import { LifecycleService } from "./lifecycle.service";

/** سجلّ رحلة الكيان — عالمي ليستخدمه الإصدار (الوثيقة) والمبيعات (الطلب). PrismaService عالمي. */
@Global()
@Module({
  providers: [LifecycleService],
  exports: [LifecycleService],
})
export class LifecycleModule {}
