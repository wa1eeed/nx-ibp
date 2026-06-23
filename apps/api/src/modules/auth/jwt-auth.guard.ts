import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "./public.decorator";
import type { AuthUser } from "./current-user.decorator";

/**
 * حارس عالمي: يتطلّب مستخدماً مصادَقاً إلا على المسارات المعلَّمة بـ @Public.
 * التحقق من التوكن يجري في TenantContextMiddleware الذي يضبط req.user.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!req.user?.userId) {
      throw new UnauthorizedException("مطلوب تسجيل الدخول");
    }
    return true;
  }
}
