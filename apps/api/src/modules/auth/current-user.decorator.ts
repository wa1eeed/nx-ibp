import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export interface AuthUser {
  userId: string;
  tenantId: string; // فارغة للسوبر أدمن (نطاق منصّة)
  roleId: string | null;
  email: string;
  isSuperAdmin?: boolean;
  clientId?: string; // نطاق بوّابة العميل
  scope?: string; // "platform" | "client" | undefined
  impersonatorId?: string; // معرّف سوبر أدمن المنصّة عند «الدخول كالحساب» (انتحال) — للبانر والتدقيق
}

/** يستخرج المستخدم المصادَق (الذي يضبطه TenantContextMiddleware) من الطلب. */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext): AuthUser | AuthUser[keyof AuthUser] | undefined => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = req.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
