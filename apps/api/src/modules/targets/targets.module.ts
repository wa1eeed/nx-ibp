import { Module } from "@nestjs/common";
import { TargetsController } from "./targets.controller";
import { TargetsService } from "./targets.service";

/** أهداف الأداء (P1-B) — أهداف إنتاج للمنتِجين/فروع التأمين وقياس الإنجاز من الإنتاج الفعلي. */
@Module({
  controllers: [TargetsController],
  providers: [TargetsService],
})
export class TargetsModule {}
