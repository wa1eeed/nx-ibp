import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "../auth/public.decorator";
import type { AuthUser } from "../auth/current-user.decorator";

/**
 * يحصر الوصول على مستخدمي بوّابة العميل (نطاق `client`). يحترم @Public لمسار الدخول.
 * يشترط وجود clientId (نطاق العميل) لمنع موظف المستأجر/السوبر أدمن من المرور.
 */
@Injectable()
export class PortalGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (req.user?.scope !== "client" || !req.user.clientId) {
      throw new ForbiddenException("هذه البوّابة لعملاء المنصّة فقط");
    }
    return true;
  }
}
