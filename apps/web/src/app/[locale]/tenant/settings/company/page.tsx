"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Check, Network, ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "@/lib/api";
import { Link } from "@/i18n/routing";

interface Company {
  name: string; nameEn: string | null; crNumber: string | null;
  unifiedNumber: string | null; vatNumber: string | null; phone: string | null; createdAt: string | null;
}

export default function TenantCompanyPage() {
  const t = useTranslations("tenantCompany");
  const [c, setC] = useState<Company | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const data = await api<Company>("/config/company");
    setC(data);
    setForm({
      name: data.name ?? "", nameEn: data.nameEn ?? "", crNumber: data.crNumber ?? "",
      unifiedNumber: data.unifiedNumber ?? "", vatNumber: data.vatNumber ?? "", phone: data.phone ?? "",
    });
  }, []);
  useEffect(() => { void load().catch(() => undefined); }, [load]);

  async function save() {
    setError(""); setNotice(""); setBusy(true);
    try {
      await api("/config/company", { method: "PUT", body: JSON.stringify(form) });
      setNotice(t("saved")); await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : t("error")); } finally { setBusy(false); }
  }

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const digits = (v: string, max: number) => v.replace(/\D/g, "").slice(0, max);
  const field = "h-10 w-full rounded-lg border border-line bg-card px-3 text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30";
  const memberSince = c?.createdAt ? new Date(c.createdAt).toLocaleDateString("en-GB") : "—";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Building2 size={20} /></div>
        <div><h1 className="text-lg font-bold text-ink">{t("title")}</h1><p className="text-[12.5px] text-subtle">{t("subtitle")}</p></div>
      </header>

      {error ? <p className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}
      {notice ? <p className="rounded-lg bg-success-soft px-3 py-2 text-[12.5px] font-medium text-success">{notice}</p> : null}

      {/* المعلومات الأساسية */}
      <section className="rounded-card border border-line bg-card p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-ink">{t("infoTitle")}</h2>
          {c?.createdAt ? <span className="text-[11.5px] text-subtle">{t("memberSince")} <span className="tnum">{memberSince}</span></span> : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2"><span className="mb-1 block text-[12px] font-medium text-muted">{t("name")}</span>
            <input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} className={field} /></label>
          <label className="block"><span className="mb-1 block text-[12px] font-medium text-muted">{t("nameEn")}</span>
            <input dir="ltr" value={form.nameEn ?? ""} onChange={(e) => set("nameEn", e.target.value)} className={field} /></label>
          <label className="block"><span className="mb-1 block text-[12px] font-medium text-muted">{t("crNumber")}</span>
            <input dir="ltr" value={form.crNumber ?? ""} onChange={(e) => set("crNumber", e.target.value)} className={`${field} tnum`} /></label>
          <label className="block"><span className="mb-1 block text-[12px] font-medium text-muted">{t("unifiedNumber")}</span>
            <input dir="ltr" inputMode="numeric" value={form.unifiedNumber ?? ""} onChange={(e) => set("unifiedNumber", digits(e.target.value, 10))} placeholder="7001234567" className={`${field} tnum`} /></label>
          <label className="block"><span className="mb-1 block text-[12px] font-medium text-muted">{t("vatNumber")}</span>
            <input dir="ltr" inputMode="numeric" value={form.vatNumber ?? ""} onChange={(e) => set("vatNumber", digits(e.target.value, 15))} placeholder="300012345600003" className={`${field} tnum`} /></label>
          <label className="block"><span className="mb-1 block text-[12px] font-medium text-muted">{t("phone")}</span>
            <input dir="ltr" inputMode="numeric" value={form.phone ?? ""} onChange={(e) => set("phone", digits(e.target.value, 10))} placeholder="0551234567" className={`${field} tnum`} /></label>
        </div>
        <button onClick={save} disabled={busy || !(form.name ?? "").trim()} className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-primary-strong px-4 text-[13px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60">
          <Check size={16} /> {t("save")}
        </button>
      </section>

      {/* الهيكل الإداري — تحت قسم الشركة */}
      <Link href="/tenant/settings/org" className="flex items-center gap-3 rounded-card border border-line bg-card p-4 shadow-card transition-colors hover:bg-surface-2">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Network size={20} /></div>
        <div className="flex-1"><div className="text-[13.5px] font-semibold text-ink">{t("orgTitle")}</div><div className="text-[12px] text-subtle">{t("orgDesc")}</div></div>
        <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary">{t("orgLink")} <ArrowLeft size={14} className="rtl:rotate-180" /></span>
      </Link>
    </div>
  );
}
