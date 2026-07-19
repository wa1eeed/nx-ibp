"use client";

import type { ReactNode } from "react";
import { usePermissions, type PermAction } from "@/hooks/usePermissions";

/**
 * بوّابة صلاحيات إعلانية: تُظهر المحتوى فقط إن كان للمستخدم الصلاحية (module + action).
 * أثناء تحميل الصلاحيات لا تُظهر شيئًا (منعًا لوميض أزرار غير مُصرّح بها).
 * حارس واجهة (تجربة) — الخادم يُنفّذ الحماية الفعلية عبر @Authorize.
 */
export function Can({
  module,
  action = "access",
  children,
  fallback = null,
}: {
  module: string;
  action?: PermAction;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can, ready } = usePermissions();
  if (!ready) return null;
  return can(module, action) ? <>{children}</> : <>{fallback}</>;
}
