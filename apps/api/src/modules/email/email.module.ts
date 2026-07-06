import { Module } from "@nestjs/common";
import { EmailController } from "./email.controller";
import { TenantEmailService } from "./tenant-email.service";
import { ConfigModule } from "../config/config.module";

/**
 * نظام البريد متعدّد المستأجرين (P0-A): إعدادات BYO Resend لكل مستأجر + التحقّق من النطاق
 * + دالة الإرسال الموحّدة sendTenantEmail (fallback مركزي وترقية تلقائية). يُصدَّر للإشعارات.
 */
@Module({
  imports: [ConfigModule],
  controllers: [EmailController],
  providers: [TenantEmailService],
  exports: [TenantEmailService],
})
export class EmailModule {}
