import { Injectable, NestMiddleware } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request, Response, NextFunction } from "express";
import {
  RequestContextService,
  type RequestStore,
} from "../request-context/request-context.service";

interface JwtPayload {
  sub: string;
  tenantId: string;
  roleId: string | null;
  email: string;
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
    const header = req.headers.authorization;

    if (header?.startsWith("Bearer ")) {
      const token = header.slice(7);
      try {
        const payload = this.jwt.verify<JwtPayload>(token);
        (req as Request & { user?: unknown }).user = {
          userId: payload.sub,
          tenantId: payload.tenantId,
          roleId: payload.roleId ?? null,
          email: payload.email,
        };
        store.tenantId = payload.tenantId;
        store.userId = payload.sub;
        store.roleId = payload.roleId ?? null;
        store.email = payload.email;
      } catch {
        // توكن غير صالح — نتركه فارغاً
      }
    }

    this.ctx.run(store, () => next());
  }
}
