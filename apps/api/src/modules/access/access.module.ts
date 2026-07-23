import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { TenantAccessService } from "./tenant-access.service";
import { TenantAccessGuard } from "./tenant-access.guard";

/**
 * فرض حالة الوصول (انتهاء التجربة/الإيقاف). عالمي: TenantAccessService يُستخدَم في
 * EntitlementService (خفض الميزات) والفوترة/المنصّة (إبطال الكاش)، والحارس عالمي.
 */
@Global()
@Module({
  providers: [TenantAccessService, { provide: APP_GUARD, useClass: TenantAccessGuard }],
  exports: [TenantAccessService],
})
export class AccessModule {}
