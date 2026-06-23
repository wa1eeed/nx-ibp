import { SetMetadata } from "@nestjs/common";
import type { RbacModule, RbacAction } from "./rbac.constants";

export const AUTHORIZE_KEY = "authorize";

export interface AuthorizeMeta {
  /** موديول RBAC المطلوبة صلاحيته. */
  module?: RbacModule;
  /** الفعل المطلوب (read/create/update/delete). */
  action?: RbacAction;
  /** مفتاح entitlement يجب أن يكون مفعّلاً في باقة المستأجر (مثل module.claims). */
  entitlement?: string;
}

/**
 * يحرس endpoint بفحص مزدوج (CLAUDE.md §3): entitlement الباقة + صلاحية الدور.
 * يقرؤه AuthorizationGuard العالمي.
 */
export const Authorize = (meta: AuthorizeMeta) => SetMetadata(AUTHORIZE_KEY, meta);
