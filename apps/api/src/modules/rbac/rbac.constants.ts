// موديولز RBAC وأفعالها — يطابق BLUEPRINT.md §4 و packages/shared/src/rbac.ts.
// مُعرَّف محلياً ليبقى الـ API مستقلاً عن @ibp/shared وقت التشغيل (قرار المرحلة 0).

export const RBAC_MODULES = [
  "dashboard",
  "sales",
  "clients",
  "production",
  "renewals",
  "service",
  "claims",
  "finance",
  "reports",
  "compliance",
  "hr",
  "settings",
] as const;
export type RbacModule = (typeof RBAC_MODULES)[number];

export type RbacAction = "read" | "create" | "update" | "delete" | "revert";

/** يربط الفعل بعمود الصلاحية في جدول Permission. */
export const ACTION_FLAG: Record<RbacAction, "canAccess" | "canCreate" | "canEdit" | "canDelete" | "canRevert"> = {
  read: "canAccess",
  create: "canCreate",
  update: "canEdit",
  delete: "canDelete",
  revert: "canRevert",
};
