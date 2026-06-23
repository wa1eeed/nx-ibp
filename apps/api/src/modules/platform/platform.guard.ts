import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "../auth/public.decorator";
import type { AuthUser } from "../auth/current-user.decorator";

/** يحصر الوصول على السوبر أدمن (نطاق منصّة). يحترم @Public لمسار الدخول. */
@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!req.user?.isSuperAdmin) throw new ForbiddenException("هذه اللوحة للسوبر أدمن فقط");
    return true;
  }
}
