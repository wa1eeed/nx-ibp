"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CreditCard, Building2, Palette, UserCircle, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import BillingPage from "../billing/page";
import CompanyPage from "../company/page";
import BrandingPage from "../branding/page";

// «حسابي» — يجمع الاشتراك والفوترة + معلومات الحساب + الهوية البصرية في مكان واحد (تبويبات) لتقليل ازدحام القائمة.
const TABS: Array<{ key: "billing" | "company" | "branding"; icon: LucideIcon; Panel: () => JSX.Element }> = [
  { key: "billing", icon: CreditCard, Panel: BillingPage as () => JSX.Element },
  { key: "company", icon: Building2, Panel: CompanyPage as () => JSX.Element },
  { key: "branding", icon: Palette, Panel: BrandingPage as () => JSX.Element },
];

function AccountHub() {
  const t = useTranslations("nav.settings");
  const params = useSearchParams();
  const requested = params.get("tab");
  const initial = TABS.some((x) => x.key === requested) ? (requested as "billing" | "company" | "branding") : "billing";
  const [tab, setTab] = useState<"billing" | "company" | "branding">(initial);
  const Active = TABS.find((x) => x.key === tab)?.Panel ?? BillingPage;

  return (
    <div>
      <div className="mb-1 flex items-center gap-2 px-1 text-[15px] font-bold text-ink">
        <UserCircle size={19} className="text-primary" /> {t("account")}
      </div>
      <div className="mb-5 flex flex-wrap gap-1 border-b border-line">
        {TABS.map(({ key, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-[13px] font-semibold transition-colors ${
              tab === key ? "border-primary text-primary-strong" : "border-transparent text-subtle hover:text-ink"
            }`}
          >
            <Icon size={15} /> {t(key)}
          </button>
        ))}
      </div>
      <Active />
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={<div className="grid min-h-[40vh] place-items-center text-subtle">…</div>}>
      <AccountHub />
    </Suspense>
  );
}
