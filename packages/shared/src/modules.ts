// تعريف الموديولز وبنية التنقل — مصدر واحد يستهلكه الشريط الجانبي ومحرّك الصلاحيات.
// الترتيب وحالات "قريباً" مطابقة للتصميم المرجعي في design-references/.

export type ModuleKey =
  | "dashboard"
  | "crm"
  | "clients"
  | "verification"
  | "requests"
  | "policies"
  | "service"
  | "renewals"
  | "premiums"
  | "commissions"
  | "claims"
  | "reports"
  | "compliance"
  | "finance"
  | "addons"
  | "settings.billing"
  | "settings.org"
  | "settings.company"
  | "settings.branding"
  | "settings.staff"
  | "settings.integrations"
  | "settings.notifications"
  | "settings.approvalChain";

export interface NavItem {
  /** مفتاح الترجمة: nav.<key> في ملفات الرسائل. */
  key: ModuleKey;
  /** المسار بعد بادئة اللغة، مثل /tenant/clients. */
  href: string;
  /** اسم أيقونة lucide-react. */
  icon: string;
  /** مفتاح الـ entitlement المقابل (module.<x>) — تحقّق الباقة. */
  entitlement?: string;
  /** قيد التطوير في النموذج الأولي الحالي. */
  comingSoon?: boolean;
}

export interface NavGroup {
  /** مفتاح ترجمة عنوان المجموعة: navGroup.<key>. */
  key: string;
  items: NavItem[];
  /** إخفاء عنوان المجموعة (للعنصر المثبَّت أعلى القائمة مثل لوحة التحكّم). */
  hideLabel?: boolean;
}

/**
 * تنقّل لوحة موظف/أدمن شركة الوساطة — مُجمَّع حسب دورة عمل الوساطة
 * (GUIDELINES.md §1: مبيعات ← تسعير ← إنتاج ← خدمة ← مطالبات ← مالية) لتحسين تجربة المستخدم.
 */
export const TENANT_NAV: NavGroup[] = [
  // مثبَّت أعلى القائمة بلا عنوان
  {
    key: "overview",
    hideLabel: true,
    items: [{ key: "dashboard", href: "/tenant/dashboard", icon: "LayoutDashboard" }],
  },
  // العملاء والامتثال (الاستقطاب والتحقّق)
  {
    key: "clients",
    items: [
      { key: "crm", href: "/tenant/crm", icon: "KanbanSquare", entitlement: "module.sales" },
      { key: "clients", href: "/tenant/clients", icon: "Users", entitlement: "module.clients" },
      { key: "verification", href: "/tenant/verification", icon: "BadgeCheck" },
      { key: "compliance", href: "/tenant/compliance", icon: "ShieldCheck", entitlement: "module.compliance" },
    ],
  },
  // الإنتاج والتجديد (طلب ← اكتتاب ← إصدار ← تجديد)
  {
    key: "production",
    items: [
      { key: "requests", href: "/tenant/requests", icon: "FileText", entitlement: "module.sales" },
      { key: "policies", href: "/tenant/policies", icon: "FileCheck2", entitlement: "module.production" },
      { key: "renewals", href: "/tenant/renewals", icon: "RefreshCw", entitlement: "module.production" },
    ],
  },
  // الخدمة والمطالبات (ما بعد البيع)
  {
    key: "operations",
    items: [
      { key: "service", href: "/tenant/service", icon: "Headset", entitlement: "module.service" },
      { key: "claims", href: "/tenant/claims", icon: "ClipboardList", entitlement: "module.claims" },
    ],
  },
  // المالية
  {
    key: "finance",
    items: [
      { key: "finance", href: "/tenant/finance", icon: "Landmark", entitlement: "module.finance" },
      { key: "premiums", href: "/tenant/premiums", icon: "Coins", entitlement: "module.finance" },
      { key: "commissions", href: "/tenant/commissions", icon: "Percent", entitlement: "module.finance" },
    ],
  },
  // التقارير والتحليلات
  {
    key: "insights",
    items: [{ key: "reports", href: "/tenant/reports", icon: "BarChart3", entitlement: "module.reports" }],
  },
  // الإعدادات والاشتراك
  {
    key: "settings",
    items: [
      { key: "addons", href: "/tenant/add-ons", icon: "Blocks" },
      { key: "settings.billing", href: "/tenant/settings/billing", icon: "CreditCard" },
      { key: "settings.org", href: "/tenant/settings/org", icon: "Network" },
      { key: "settings.company", href: "/tenant/settings/company", icon: "Building2", comingSoon: true },
      { key: "settings.branding", href: "/tenant/settings/branding", icon: "Palette", comingSoon: true },
      { key: "settings.staff", href: "/tenant/settings/staff", icon: "UserCog" },
      { key: "settings.integrations", href: "/tenant/settings/integrations", icon: "Plug" },
      { key: "settings.notifications", href: "/tenant/settings/notifications", icon: "Bell" },
      { key: "settings.approvalChain", href: "/tenant/settings/approval-chain", icon: "ListChecks" },
    ],
  },
];

/** وحدات الـ API (NestJS) — module لكل مجال، حسب GUIDELINES.md §5. */
export const API_MODULES = [
  "auth",
  "tenants",
  "rbac",
  "billing",
  "clients",
  "sales",
  "production",
  "service",
  "claims",
  "finance",
  "documents",
  "verification",
  "reports",
  "compliance",
  "hr",
] as const;
export type ApiModule = (typeof API_MODULES)[number];
