import { CanActivate, ExecutionContext, ForbiddenException, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { TenantAccessService } from "./tenant-access.service";
import type { AuthUser } from "../auth/current-user.decorator";

// مسارات مستثناة دائمًا (حتى عند الحجب) — كي يستطيع المستخدم الدخول والدفع والتجديد ورؤية إشعاراته
const EXEMPT_PREFIX = ["/auth", "/billing", "/config/payment", "/notifications", "/health"];
// نطاقات لها دورة حياتها الخاصة — لا يفرضها هذا الحارس
const SKIP_PREFIX = ["/platform", "/portal"];
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const startsWithAny = (path: string, prefixes: string[]) => prefixes.some((p) => path === p || path.startsWith(p + "/"));

/**
 * فرض حالة الوصول (بعد المصادقة، عالميًا):
 *  - `SUSPENDED`/`CANCELLED` ⇒ **403** على كل شيء عدا المستثنى (دخول/فوترة).
 *  - انتهاء التجربة ⇒ **402** على عمليات الكتابة فقط (قراءة مسموحة) عدا المستثنى.
 *  - خفض الميزات المتقدّمة يتمّ في EntitlementService (403 على `feature.*` غير الأساسية).
 * يستثني المسارات العامة (بلا مستخدم) ونطاقَي المنصّة والعميل.
 */
@Injectable()
export class TenantAccessGuard implements CanActivate {
  constructor(private readonly access: TenantAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ user?: AuthUser; method: string; path: string; originalUrl: string }>();
    const user = req.user;
    if (!user?.tenantId) return true; // مسار عام (بلا مصادقة) — يحرسه JwtAuthGuard

    const path = (req.path || req.originalUrl || "").split("?")[0];
    if (startsWithAny(path, SKIP_PREFIX)) return true; // نطاق المنصّة/العميل
    if (startsWithAny(path, EXEMPT_PREFIX)) return true; // دخول/فوترة/إشعارات

    const acc = await this.access.resolve(user.tenantId);

    if (acc.hardBlocked) {
      throw new ForbiddenException(acc.state === "cancelled" ? "الحساب مُلغى — تواصل مع الدعم." : "الحساب موقوف — تواصل مع الدعم لإعادة التفعيل.");
    }
    if (acc.writeBlocked && WRITE_METHODS.has(req.method)) {
      const expiredMsg = acc.state === "subscription_expired"
        ? "انتهى اشتراكك. جدّد للمتابعة — بياناتك محفوظة والقراءة متاحة."
        : "انتهت فترتك التجريبية. جدّد اشتراكك للمتابعة — بياناتك محفوظة والقراءة متاحة.";
      throw new HttpException(
        { statusCode: HttpStatus.PAYMENT_REQUIRED, error: acc.state === "subscription_expired" ? "SUBSCRIPTION_EXPIRED" : "TRIAL_EXPIRED", message: expiredMsg },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return true;
  }
}
