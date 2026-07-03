// قوالب الأدوار الجاهزة — منقولة حرفياً من مصفوفة BLUEPRINT.md §4.
// تُستخدم في الـ seed كأدوار preset، وفي محرّك RBAC (المرحلة 2).
// الرموز: A=وصول C=إضافة E=تعديل D=حذف ، "—"=بدون صلاحية.

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

export interface PermissionSet {
  canAccess: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canRevert: boolean; // E4 — التراجع خطوة للوراء (رمز "R")
}

/** يحوّل رمزاً مثل "ACEDR" أو "AE" أو "—" إلى مجموعة صلاحيات. R = التراجع خطوة. */
export function parsePerm(code: string): PermissionSet {
  const c = code.toUpperCase();
  return {
    canAccess: c.includes("A"),
    canCreate: c.includes("C"),
    canEdit: c.includes("E"),
    canDelete: c.includes("D"),
    canRevert: c.includes("R"),
  };
}

export interface PresetRole {
  code: string;
  nameAr: string;
  nameEn: string;
  /** كل عمود = رمز صلاحية حسب الجدول المرجعي. */
  matrix: Record<RbacModule, string>;
}

// الترتيب: dashboard sales clients production renewals service claims finance reports compliance hr settings
function row(...codes: string[]): Record<RbacModule, string> {
  return RBAC_MODULES.reduce(
    (acc, m, i) => ({ ...acc, [m]: codes[i] ?? "—" }),
    {} as Record<RbacModule, string>,
  );
}

export const PRESET_ROLES: PresetRole[] = [
  { code: "general_manager", nameAr: "المدير العام", nameEn: "General Manager",
    matrix: row("A", "ACED", "ACED", "ACEDR", "ACEDR", "ACEDR", "ACEDR", "ACED", "ACED", "ACED", "ACED", "ACED") },
  { code: "sales_manager", nameAr: "مدير المبيعات", nameEn: "Sales Manager",
    matrix: row("A", "ACED", "ACE", "—", "ACE", "—", "—", "—", "A", "—", "—", "—") },
  { code: "sales_rep", nameAr: "ممثل مبيعات", nameEn: "Sales Representative",
    matrix: row("A", "ACE", "ACE", "—", "—", "—", "—", "—", "—", "—", "—", "—") },
  { code: "pricing_officer", nameAr: "مسؤول التسعير", nameEn: "Pricing Officer",
    matrix: row("A", "AE", "—", "ACE", "ACE", "—", "—", "—", "A", "—", "—", "—") },
  { code: "policy_admin", nameAr: "مسؤول إدارة الوثائق", nameEn: "Policy Administration Officer",
    matrix: row("A", "—", "A", "ACE", "—", "A", "—", "—", "—", "—", "—", "—") },
  { code: "customer_care_manager", nameAr: "مدير عناية العملاء", nameEn: "Customer Care Manager",
    matrix: row("A", "—", "AE", "—", "—", "ACED", "A", "—", "A", "—", "—", "—") },
  { code: "claims_officer", nameAr: "مسؤول المطالبات", nameEn: "Claims Officer",
    matrix: row("A", "—", "A", "—", "—", "A", "ACE", "—", "—", "—", "—", "—") },
  { code: "accountant", nameAr: "المحاسب / مدير مالي", nameEn: "Accountant / Finance Manager",
    matrix: row("A", "—", "—", "—", "—", "—", "—", "ACED", "A", "—", "—", "—") },
  { code: "collector", nameAr: "محصّل", nameEn: "Collector",
    matrix: row("A", "—", "A", "—", "—", "—", "—", "AE", "—", "—", "—", "—") },
  { code: "compliance_manager", nameAr: "مدير الالتزام", nameEn: "Compliance Manager",
    matrix: row("A", "A", "—", "A", "—", "—", "A", "A", "A", "ACED", "—", "—") },
  { code: "hr_manager", nameAr: "مدير الموارد البشرية", nameEn: "HR Manager",
    matrix: row("A", "—", "—", "—", "—", "—", "—", "—", "—", "—", "ACED", "—") },
  { code: "admin_assistant", nameAr: "مساعد إداري", nameEn: "Administrative Assistant",
    matrix: row("A", "—", "—", "—", "—", "—", "—", "—", "—", "—", "A", "—") },
];
