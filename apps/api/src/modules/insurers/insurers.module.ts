import { Module } from "@nestjs/common";
import { InsurersController } from "./insurers.controller";
import { InsurersService } from "./insurers.service";

/** إدارة شركات التأمين (سجلّ + نِسب/تسوية/بنك + إحصاءات الإنتاج). */
@Module({
  controllers: [InsurersController],
  providers: [InsurersService],
})
export class InsurersModule {}
