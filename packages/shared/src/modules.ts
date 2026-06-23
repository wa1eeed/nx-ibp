// تعريف الموديولز وبنية التنقل — مصدر واحد يستهلكه الشريط الجانبي ومحرّك الصلاحيات.
// الترتيب وحالات "قريباً" مطابقة للتصميم المرجعي في design-references/.

export type ModuleKey =
  | "dashboard"
  | "clients"
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
  | "settings.company"
  | "settings.branding"
  | "settings.staff"
  | "settings.notifications";

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
}

/** تنقّل لوحة موظف/أدمن شركة الوساطة (Broker Workspace). */
export const TENANT_NAV: NavGroup[] = [
  {
    key: "workspace",
    items: [
      { key: "dashboard", href: "/tenant/dashboard", icon: "LayoutDashboard" },
      { key: "clients", href: "/tenant/clients", icon: "Users", entitlement: "module.clients" },
      { key: "requests", href: "/tenant/requests", icon: "FileText", entitlement: "module.sales" },
      { key: "policies", href: "/tenant/policies", icon: "FileCheck2", entitlement: "module.production" },
      { key: "service", href: "/tenant/service", icon: "Headset", entitlement: "module.service" },
      { key: "renewals", href: "/tenant/renewals", icon: "RefreshCw", entitlement: "module.production" },
      { key: "premiums", href: "/tenant/premiums", icon: "Coins", entitlement: "module.finance", comingSoon: true },
      { key: "commissions", href: "/tenant/commissions", icon: "Percent", entitlement: "module.finance" },
      { key: "claims", href: "/tenant/claims", icon: "ClipboardList", entitlement: "module.claims" },
      { key: "reports", href: "/tenant/reports", icon: "BarChart3", entitlement: "module.reports", comingSoon: true },
      { key: "compliance", href: "/tenant/compliance", icon: "ShieldCheck", entitlement: "module.compliance", comingSoon: true },
      { key: "finance", href: "/tenant/finance", icon: "Landmark", entitlement: "module.finance", comingSoon: true },
      { key: "addons", href: "/tenant/add-ons", icon: "Blocks" },
    ],
  },
  {
    key: "settings",
    items: [
      { key: "settings.company", href: "/tenant/settings/company", icon: "Building2", comingSoon: true },
      { key: "settings.branding", href: "/tenant/settings/branding", icon: "Palette", comingSoon: true },
      { key: "settings.staff", href: "/tenant/settings/staff", icon: "UserCog" },
      { key: "settings.notifications", href: "/tenant/settings/notifications", icon: "Bell", comingSoon: true },
    ],
  },
];

/** وحدات الـ API (NestJS) — module لكل مجال، حسب CLAUDE.md §5. */
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
