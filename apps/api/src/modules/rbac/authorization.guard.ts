import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AUTHORIZE_KEY, type AuthorizeMeta } from "./authorize.decorator";
import { EntitlementService } from "./entitlement.service";
import { PermissionService } from "./permission.service";
import type { AuthUser } from "../auth/current-user.decorator";

/**
 * الحارس الموحّد (GUIDELINES.md §3): لكل endpoint معلَّم بـ @Authorize يفحص:
 *  1) entitlement: هل الموديول مفعّل في باقة المستأجر؟ وإلا 403.
 *  2) RBAC: هل لدور المستخدم صلاحية الفعل؟ وإلا 403.
 * المسارات بلا @Authorize تمرّ (يحرسها JwtAuthGuard للمصادقة فقط).
 */
@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementService,
    private readonly permissions: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<AuthorizeMeta | undefined>(AUTHORIZE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!meta) return true;

    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = req.user;
    if (!user) throw new ForbiddenException("غير مصرّح");

    if (meta.entitlement) {
      const enabled = await this.entitlements.isFeatureEnabled(user.tenantId, meta.entitlement);
      if (!enabled) {
        throw new ForbiddenException("الموديول غير مفعّل في باقة المستأجر (entitlement)");
      }
    }

    if (meta.module && meta.action) {
      const allowed = await this.permissions.can(user.roleId, meta.module, meta.action);
      if (!allowed) {
        throw new ForbiddenException("لا تملك صلاحية لهذا الإجراء (RBAC)");
      }
    }

    return true;
  }
}
