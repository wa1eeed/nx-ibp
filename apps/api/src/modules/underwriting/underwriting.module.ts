import { Module } from "@nestjs/common";
import { SlipsController } from "./slips.controller";
import { SlipsService } from "./slips.service";

@Module({
  controllers: [SlipsController],
  providers: [SlipsService],
})
export class UnderwritingModule {}
