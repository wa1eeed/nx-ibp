import { Module } from "@nestjs/common";
import { BankController } from "./bank.controller";
import { BankService } from "./bank.service";

/** الحسابات البنكية والتسوية البنكية (§1.6 — تحت المالية). */
@Module({
  controllers: [BankController],
  providers: [BankService],
})
export class BankModule {}
