import { Injectable, NestMiddleware } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request, Response, NextFunction } from "express";
import {
  RequestContextService,
  type RequestStore,
} from "../request-context/request-context.service";

interface JwtPayload {
  sub: string;
  tenantId?: string; // غائبة للسوبر أدمن
  roleId?: string | null;
  email: string;
  scope?: string; // "platform" للسوبر أدمن · "client" لبوّابة العميل
  clientId?: string; // نطاق بوّابة العميل
  sid?: string; // معرّف الجلسة/التوكن (للتدقيق)
  imp?: string; // معرّف سوبر أدمن المنصّة عند الانتحال (token مُصدَر من /platform/tenants/:id/impersonate)
}

/**
 * يفكّ JWT من ترويسة Authorization، يضبط req.user وسياق المستأجر (ALS)،
 * ثم يلفّ بقية الطلب داخل السياق ليصل tenantId إلى Prisma middleware.
 * توكن غائب/غير صالح ⇒ سياق فارغ، والحارس يرفض المسارات المحمية.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(
    private readonly jwt: JwtService,
    private readonly ctx: RequestContextService,
  ) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const store: RequestStore = {};
    // التقاط IP/الجهاز لكل طلب (للتدقيق) — يراعي X-Forwarded-For خلف العاكس
    const fwd = req.headers["x-forwarded-for"];
    store.ip = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim() || req.ip || req.socket?.remoteAddress || undefined;
    store.userAgent = req.headers["user-agent"]?.toString().slice(0, 400);
    const header = req.headers.authorization;

    if (header?.startsWith("Bearer ")) {
      const token = header.slice(7);
      try {
        const payload = this.jwt.verify<JwtPayload>(token);
        (req as Request & { user?: unknown }).user = {
          userId: payload.sub,
          tenantId: payload.tenantId ?? "",
          roleId: payload.roleId ?? null,
          email: payload.email,
          isSuperAdmin: payload.scope === "platform",
          clientId: payload.clientId,
          scope: payload.scope,
          impersonatorId: payload.imp,
        };
        // بلا tenantId (سوبر أدمن) ⇒ ALS بلا مستأجر ⇒ استعلامات Prisma غير مفلترة (عابرة للمستأجرين)
        // نطاق العميل ⇒ يبقى tenantId (عزل المستأجر) + clientId (يفلتر به portal.service صراحةً)
        store.tenantId = payload.tenantId;
        store.userId = payload.sub;
        store.roleId = payload.roleId ?? null;
        store.email = payload.email;
        store.clientId = payload.clientId;
        store.scope = payload.scope;
        store.sessionId = payload.sid;
      } catch {
        // توكن غير صالح — نتركه فارغاً
      }
    }

    this.ctx.run(store, () => next());
  }
}
