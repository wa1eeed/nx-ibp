"use client";

import { useState } from "react";
import { useParams, notFound } from "next/navigation";
import { ArrowLeft, FileText, ShieldCheck, Database, Gauge, Building2, Headset } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";
import { ContactSalesModal } from "@/components/landing/ContactSalesModal";

const DOCS = ["terms", "privacy", "dpa", "sla"] as const;
type Doc = (typeof DOCS)[number];
const ICONS: Record<Doc, typeof FileText> = { terms: FileText, privacy: ShieldCheck, dpa: Database, sla: Gauge };

/** المستندات القانونية العامة (شروط الخدمة/الخصوصية/معالجة البيانات/مستوى الخدمة) — مسار ديناميكي مدفوع بالترجمة. */
export default function LegalPage() {
  const params = useParams();
  const t = useTranslations("legal");
  const tg = useTranslations();
  const [contact, setContact] = useState(false);

  const raw = String(params?.doc ?? "");
  if (!DOCS.includes(raw as Doc)) notFound();
  const doc = raw as Doc;
  const sections = (t.raw(`${doc}.sections`) as Array<{ h: string; b: string }>) ?? [];

  return (
    <div className="min-h-screen bg-surface text-ink">
      {/* الشريط العلوي */}
      <header className="border-b border-line bg-card/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3.5">
          <Link href="/" className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-muted hover:text-ink">
            <ArrowLeft size={15} className="ltr:rotate-180" /> {t("backHome")}
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-[13px] font-bold text-ink sm:inline">{tg("brand.name")}</span>
            <LocaleSwitcher />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 lg:grid-cols-[240px_1fr]">
        {/* فهرس المستندات */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="text-[11.5px] font-semibold uppercase tracking-wide text-subtle">{t("tocTitle")}</div>
          <nav className="mt-3 flex flex-col gap-1">
            {DOCS.map((d) => {
              const Icon = ICONS[d];
              const active = d === doc;
              return (
                <Link
                  key={d}
                  href={`/legal/${d}`}
                  aria-current={active ? "page" : undefined}
                  className={["inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors", active ? "bg-primary-soft text-primary-strong" : "text-muted hover:bg-surface-2 hover:text-ink"].join(" ")}
                >
                  <Icon size={15} className="shrink-0" /> {t(`nav.${d}`)}
                </Link>
              );
            })}
          </nav>
          <div className="mt-6 rounded-xl border border-line bg-card p-4">
            <div className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink"><Building2 size={14} className="text-primary" /> {t("provider")}</div>
            <p className="mt-2 text-[12px] leading-relaxed text-subtle">{t("contactBody")}</p>
            <button onClick={() => setContact(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink hover:bg-surface">
              <Headset size={14} /> {t("contactCta")}
            </button>
          </div>
        </aside>

        {/* المحتوى */}
        <main className="min-w-0">
          <h1 className="text-[26px] font-bold tracking-tight text-ink">{t(`${doc}.title`)}</h1>
          <p className="mt-1 text-[12.5px] text-subtle">{t("lastUpdated")}: {t("updatedDate")}</p>
          <p className="mt-4 text-[14.5px] leading-relaxed text-muted">{t(`${doc}.intro`)}</p>

          <ol className="mt-7 space-y-6">
            {sections.map((s, i) => (
              <li key={i} className="border-t border-line pt-6 first:border-t-0 first:pt-0">
                <h2 className="flex items-baseline gap-2 text-[16px] font-bold text-ink">
                  <span className="text-[13px] font-bold text-primary tnum">{i + 1}.</span> {s.h}
                </h2>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">{s.b}</p>
              </li>
            ))}
          </ol>

          <p className="mt-9 rounded-xl border border-line bg-surface-2 px-4 py-3 text-[12.5px] leading-relaxed text-subtle">{t("disclaimer")}</p>
        </main>
      </div>

      {contact ? <ContactSalesModal onClose={() => setContact(false)} /> : null}
    </div>
  );
}
