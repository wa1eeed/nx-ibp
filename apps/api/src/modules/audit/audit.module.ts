import { Module } from "@nestjs/common";
import { AuditController } from "./audit.controller";
import { AuditViewService } from "./audit-view.service";

/** عرض سجل التدقيق (للمستأجر والسوبر أدمن) بأسماء المنفّذين — قراءة فقط. */
@Module({
  controllers: [AuditController],
  providers: [AuditViewService],
  exports: [AuditViewService],
})
export class AuditViewModule {}
