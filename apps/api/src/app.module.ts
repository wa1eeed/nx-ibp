import { Module, MiddlewareConsumer, NestModule, RequestMethod } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { raw } from "express";
import { RequestContextModule } from "./common/request-context/request-context.module";
import { TenantContextMiddleware } from "./common/middleware/tenant-context.middleware";
import { AuditModule } from "./common/audit/audit.module";
import { SequenceModule } from "./common/sequence/sequence.module";
import { StorageModule } from "./common/storage/storage.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { RbacModule } from "./modules/rbac/rbac.module";
import { AuthModule } from "./modules/auth/auth.module";
import { JwtAuthGuard } from "./modules/auth/jwt-auth.guard";
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
import { StaffModule } from "./modules/staff/staff.module";

/**
 * الوحدة الجذرية. معماري وحدات — module لكل مجال (CLAUDE.md §5).
 * المرحلة 1: المصادقة + سياق المستأجر (ALS) + فرض tenantId عبر Prisma middleware.
 * - TenantContextMiddleware: يفكّ JWT ويضبط سياق المستأجر لكل طلب.
 * - JwtAuthGuard عالمي: يحمي كل المسارات إلا @Public.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RequestContextModule,
    AuditModule,
    SequenceModule,
    StorageModule,
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
    DocumentsModule,
    ServiceModule,
    ClaimsModule,
    RenewalsModule,
    VerificationModule,
    StaffModule,
  ],
  providers: [
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
