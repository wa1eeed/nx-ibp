import { Module } from "@nestjs/common";
import { LeaveController } from "./leave.controller";
import { LeaveService } from "./leave.service";

/** §8.2 — طلبات إجازات الموظفين (HR خفيف). */
@Module({
  controllers: [LeaveController],
  providers: [LeaveService],
})
export class LeaveModule {}
