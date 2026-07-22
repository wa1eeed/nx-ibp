import { Module, MiddlewareConsumer, NestModule, RequestMethod } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { APP_GUARD } from "@nestjs/core";
import { raw } from "express";
import { RequestContextModule } from "./common/request-context/request-context.module";
import { TenantContextMiddleware } from "./common/middleware/tenant-context.middleware";
import { AuditModule } from "./common/audit/audit.module";
import { SequenceModule } from "./common/sequence/sequence.module";
import { StorageModule } from "./common/storage/storage.module";
import { ZatcaCryptoModule } from "./common/zatca/zatca-crypto.module";
import { SecurityModule } from "./common/security/security.module";
import { ZatcaModule } from "./modules/finance/zatca/zatca.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { RbacModule } from "./modules/rbac/rbac.module";
import { AuthModule } from "./modules/auth/auth.module";
import { JwtAuthGuard } from "./modules/auth/jwt-auth.guard";
import { ThrottleGuard } from "./common/security/throttle.guard";
import { HealthModule } from "./modules/health/health.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { ClientsModule } from "./modules/clients/clients.module";
import { RequestsModule } from "./modules/requests/requests.module";
import { UnderwritingModule } from "./modules/underwriting/underwriting.module";
import { ProductionModule } from "./modules/production/production.module";
import { FinanceModule } from "./modules/finance/finance.module";
import { DocumentsModule } from "./modules/documents/documents.module";
import { ServiceModule } from "./modules/service/service.module";
import { ClaimsModule } from "./modules/claims/claims.module";
import { RenewalsModule } from "./modules/renewals/renewals.module";
import { VerificationModule } from "./modules/verification/verification.module";
import { PlatformModule } from "./modules/platform/platform.module";
import { PortalModule } from "./modules/portal/portal.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { ComplianceModule } from "./modules/compliance/compliance.module";
import { RegulatoryModule } from "./modules/regulatory/regulatory.module";
import { StaffModule } from "./modules/staff/staff.module";
import { SignupModule } from "./modules/signup/signup.module";
import { BillingModule } from "./modules/billing/billing.module";
import { OrgModule } from "./modules/org/org.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { ConfigModule as TenantConfigModule } from "./modules/config/config.module";
import { RevertModule } from "./modules/revert/revert.module";
import { CrmModule } from "./modules/crm/crm.module";
import { RemindersModule } from "./modules/reminders/reminders.module";
import { ProducersModule } from "./modules/producers/producers.module";
import { FormTemplatesModule } from "./modules/form-templates/form-templates.module";
import { EmailModule } from "./modules/email/email.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { ComplaintsModule } from "./modules/complaints/complaints.module";
import { AmlModule } from "./modules/aml/aml.module";
import { CoverNotesModule } from "./modules/cover-notes/cover-notes.module";
import { BankModule } from "./modules/bank/bank.module";
import { BudgetModule } from "./modules/budget/budget.module";
import { PayrollModule } from "./modules/payroll/payroll.module";
import { LeaveModule } from "./modules/leave/leave.module";
import { TargetsModule } from "./modules/targets/targets.module";
import { AuditViewModule } from "./modules/audit/audit.module";
import { InsurersModule } from "./modules/insurers/insurers.module";
import { SearchModule } from "./modules/search/search.module";
import { WebhooksModule } from "./modules/webhooks/webhooks.module";

/**
 * الوحدة الجذرية. معماري وحدات — module لكل مجال (GUIDELINES.md §5).
 * المرحلة 1: المصادقة + سياق المستأجر (ALS) + فرض tenantId عبر Prisma middleware.
 * - TenantContextMiddleware: يفكّ JWT ويضبط سياق المستأجر لكل طلب.
 * - JwtAuthGuard عالمي: يحمي كل المسارات إلا @Public.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    RequestContextModule,
    AuditModule,
    SequenceModule,
    StorageModule,
    ZatcaCryptoModule,
    SecurityModule,
    PrismaModule,
    RedisModule,
    RbacModule,
    AuthModule,
    HealthModule,
    CatalogModule,
    ClientsModule,
    RequestsModule,
    UnderwritingModule,
    ProductionModule,
    FinanceModule,
    ZatcaModule,
    DocumentsModule,
    ServiceModule,
    ClaimsModule,
    RenewalsModule,
    VerificationModule,
    PlatformModule,
    PortalModule,
    ReportsModule,
    ComplianceModule,
    RegulatoryModule,
    StaffModule,
    SignupModule,
    BillingModule,
    OrgModule,
    NotificationsModule,
    TenantConfigModule,
    RevertModule,
    CrmModule,
    RemindersModule,
    ProducersModule,
    FormTemplatesModule,
    EmailModule,
    PaymentsModule,
    ComplaintsModule,
    AmlModule,
    CoverNotesModule,
    BankModule,
    BudgetModule,
    PayrollModule,
    LeaveModule,
    TargetsModule,
    AuditViewModule,
    InsurersModule,
    SearchModule,
    WebhooksModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottleGuard }, // تحديد المعدّل أولًا (يحمي المسارات العامة أيضًا)
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    TenantContextMiddleware,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // بايتات خام لرفع المستندات (يعمل في الإقلاع والاختبار معاً)
    consumer
      .apply(raw({ type: () => true, limit: "50mb" }))
      .forRoutes({ path: "documents/blob/:token", method: RequestMethod.PUT });
    consumer.apply(TenantContextMiddleware).forRoutes("*");
  }
}
