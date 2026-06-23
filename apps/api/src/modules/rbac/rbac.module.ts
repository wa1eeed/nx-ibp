import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { EntitlementService } from "./entitlement.service";
import { PermissionService } from "./permission.service";
import { AuthorizationGuard } from "./authorization.guard";

/**
 * يوفّر محرّك الصلاحيات عالمياً ويُركّب AuthorizationGuard كحارس عالمي.
 */
@Global()
@Module({
  providers: [
    EntitlementService,
    PermissionService,
    { provide: APP_GUARD, useClass: AuthorizationGuard },
  ],
  exports: [EntitlementService, PermissionService],
})
export class RbacModule {}
