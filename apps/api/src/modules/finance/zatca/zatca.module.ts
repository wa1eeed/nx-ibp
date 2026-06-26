import { Module } from "@nestjs/common";
import { ZatcaController } from "./zatca.controller";
import { ZatcaGateway } from "./zatca.gateway";
import { ZatcaOnboardingService } from "./zatca-onboarding.service";
import { ZatcaBillingService } from "./zatca-billing.service";
import { ZatcaInvoiceRouter } from "./zatca-invoice.router";
import { ZatcaReportingQueue } from "./zatca-reporting.queue";

/**
 * وحدة ZATCA (Fatoora المرحلة 2): التهيئة، توليد مستندات الفوترة المتوافقة،
 * التوجيه (B2B Clearance / B2C Reporting)، وطابور الإبلاغ. تُصدِّر الخدمات
 * التي تستهلكها وحدة المالية داخل معاملة الاعتماد.
 */
@Module({
  controllers: [ZatcaController],
  providers: [ZatcaGateway, ZatcaOnboardingService, ZatcaBillingService, ZatcaInvoiceRouter, ZatcaReportingQueue],
  exports: [ZatcaBillingService, ZatcaInvoiceRouter],
})
export class ZatcaModule {}
