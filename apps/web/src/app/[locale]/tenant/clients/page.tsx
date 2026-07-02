"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, Building2, User, X, Check, Ban, Search, BadgeCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { api, getToken, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { useConfirm } from "@/components/ui/ConfirmProvider";

interface ClientRow {
  id: string;
  code: string | null;
  type: "CORPORATE" | "INDIVIDUAL";
  name: string;
  crNumber: string | null;
  nationalId: string | null;
  phone: string | null;
  city: string | null;
  complianceStatus: "PENDING" | "APPROVED" | "REJECTED";
}

type Tab = "ALL" | "CORPORATE" | "INDIVIDUAL";

const COMPLIANCE_TONE: Record<string, BadgeTone> = { APPROVED: "success", PENDING: "warning", REJECTED: "danger" };

export default function ClientsPage() {
  const t = useTranslations();
  const confirm = useConfirm();
  const router = useRouter();
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState("");
  const [tab, setTab] = useState<Tab>("ALL");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => ({
    ALL: rows.length,
    CORPORATE: rows.filter((c) => c.type === "CORPORATE").length,
    INDIVIDUAL: rows.filter((c) => c.type === "INDIVIDUAL").length,
  }), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((c) => {
      if (tab !== "ALL" && c.type !== tab) return false;
      if (!q) return true;
      return [c.name, c.crNumber, c.nationalId, c.phone, c.code, c.city]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q));
    });
  }, [rows, tab, query]);

  const [type, setType] = useState<"CORPORATE" | "INDIVIDUAL">("CORPORATE");
  const [name, setName] = useState("");
  const [crNumber, setCrNumber] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  // حقول معيارية إضافية
  const [nationalAddress, setNationalAddress] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [relationStatus, setRelationStatus] = useState("");
  const [legalForm, setLegalForm] = useState("");
  const [source, setSource] = useState("");
  const [producerName, setProducerName] = useState("");
  const [businessActivity, setBusinessActivity] = useState("");

  const load = useCallback(async () => {
    const cs = await api<ClientRow[]>("/clients");
    setRows(cs);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    void load().catch(() => undefined);
  }, [load, router]);

  async function createClient(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api("/clients", {
        method: "POST",
        body: JSON.stringify({
          type,
          name,
          crNumber: type === "CORPORATE" ? crNumber : undefined,
          nationalId: type === "INDIVIDUAL" ? nationalId : undefined,
          email: email || undefined,
          city: city || undefined,
          nationalAddress: nationalAddress || undefined,
          vatNumber: vatNumber || undefined,
          relationStatus: relationStatus || undefined,
          legalForm: legalForm || undefined,
          source: source || undefined,
          producerName: source === "producer" ? (producerName || undefined) : undefined,
          businessActivity: businessActivity || undefined,
        }),
      });
      setShowForm(false);
      setName(""); setCrNumber(""); setNationalId(""); setEmail(""); setCity("");
      setNationalAddress(""); setVatNumber(""); setRelationStatus(""); setLegalForm(""); setSource(""); setProducerName(""); setBusinessActivity("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطأ");
    } finally {
      setSaving(false);
    }
  }

  async function decide(id: string, decision: "APPROVED" | "REJECTED") {
    const k = decision === "APPROVED" ? "approveClient" : "rejectClient";
    const ok = await confirm({
      title: t(`confirm.${k}.title`),
      description: t(`confirm.${k}.desc`),
      confirmLabel: t(`confirm.${k}.action`),
      tone: decision === "REJECTED" ? "danger" : "primary",
    });
    if (!ok) return;
    setError("");
    try {
      await api(`/clients/${id}/compliance`, { method: "POST", body: JSON.stringify({ decision }) });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطأ");
    }
  }

  // تحقّق حكومي مباشر من صفحة العميل (يقين للأفراد · واثق للمنشآت) — مربوط بالعميل.
  async function verify(c: ClientRow) {
    const idVal = c.type === "CORPORATE" ? c.crNumber : c.nationalId;
    if (!idVal) { setNotice(""); setError(t("clients.verify.missingId")); return; }
    const provider = c.type === "CORPORATE" ? t("verification.providers.wathiq") : t("verification.providers.yaqeen");
    const ok = await confirm({
      title: t("clients.verify.title"),
      description: t("clients.verify.desc", { provider }),
      confirmLabel: t("clients.verify.action"),
    });
    if (!ok) return;
    setError(""); setNotice(""); setVerifying(c.id);
    try {
      const endpoint = c.type === "CORPORATE" ? "/verification/wathiq" : "/verification/yaqeen";
      const body = c.type === "CORPORATE" ? { crNumber: idVal, clientId: c.id } : { nationalId: idVal, clientId: c.id };
      await api(endpoint, { method: "POST", body: JSON.stringify(body) });
      setNotice(t("clients.verify.done", { provider, name: c.name }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطأ");
    } finally {
      setVerifying("");
    }
  }

  return (
    <div>
      <PageHeader
        title={t("clients.title")}
        subtitle={t("clients.subtitle")}
        actions={
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-strong px-3.5 py-2 text-[13px] font-semibold text-primary-fg shadow-sm transition-colors hover:bg-primary"
          >
            {showForm ? <X size={16} /> : <Plus size={16} />}
            {showForm ? t("clients.cancel") : t("clients.newClient")}
          </button>
        }
      />

      {error ? <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}
      {notice ? <p className="mb-3 rounded-lg bg-success-soft px-3 py-2 text-[12.5px] font-medium text-success">{notice}</p> : null}

      {showForm ? (
        <form onSubmit={createClient} className="mb-4 grid grid-cols-1 gap-3 rounded-card border border-line bg-card p-5 shadow-card sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-muted">{t("clients.type.label")}</span>
            <select value={type} onChange={(e) => setType(e.target.value as "CORPORATE" | "INDIVIDUAL")} className="h-9 w-full rounded-lg border border-line bg-card px-2 text-[13px]">
              <option value="CORPORATE">{t("clients.type.corporate")}</option>
              <option value="INDIVIDUAL">{t("clients.type.individual")}</option>
            </select>
          </label>
          <Field label={t("clients.table.client")} value={name} onChange={setName} required />
          {type === "CORPORATE" ? (
            <Field label="CR" value={crNumber} onChange={setCrNumber} />
          ) : (
            <Field label={t("clients.nationalId")} value={nationalId} onChange={setNationalId} />
          )}
          <Field label={t("clients.email")} value={email} onChange={setEmail} type="email" />
          <Field label={t("clients.table.city")} value={city} onChange={setCity} />
          {/* حقول معيارية لوساطة التأمين */}
          {type === "CORPORATE" ? <Field label="الرقم الضريبي (VAT)" value={vatNumber} onChange={setVatNumber} /> : null}
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-muted">العلاقة</span>
            <select value={relationStatus} onChange={(e) => setRelationStatus(e.target.value)} className="h-9 w-full rounded-lg border border-line bg-card px-2 text-[13px]">
              <option value="">—</option>
              <option value="captive">أسير (Captive)</option>
              <option value="non_captive">غير أسير</option>
            </select>
          </label>
          {type === "CORPORATE" ? (
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-muted">الشكل القانوني</span>
              <select value={legalForm} onChange={(e) => setLegalForm(e.target.value)} className="h-9 w-full rounded-lg border border-line bg-card px-2 text-[13px]">
                <option value="">—</option>
                <option value="llc">ذات مسؤولية محدودة</option>
                <option value="joint_stock">مساهمة</option>
                <option value="partnership">تضامن/توصية</option>
                <option value="jv">مشروع مشترك</option>
                <option value="joint_liability">تضامنية</option>
                <option value="sole_proprietor">مؤسسة فردية</option>
              </select>
            </label>
          ) : null}
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-muted">المصدر</span>
            <select value={source} onChange={(e) => setSource(e.target.value)} className="h-9 w-full rounded-lg border border-line bg-card px-2 text-[13px]">
              <option value="">—</option>
              <option value="direct">مباشر</option>
              <option value="producer">منتِج/وسيط فرعي</option>
            </select>
          </label>
          {source === "producer" ? <Field label="اسم المنتِج" value={producerName} onChange={setProducerName} /> : null}
          <Field label="النشاط التجاري" value={businessActivity} onChange={setBusinessActivity} />
          <Field label="العنوان الوطني" value={nationalAddress} onChange={setNationalAddress} />
          <div className="flex items-end">
            <button type="submit" disabled={saving} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-strong px-4 text-[13px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60">
              {saving ? "…" : t("clients.create")}
            </button>
          </div>
        </form>
      ) : null}

      {/* تبويبات (الكل/شركات/أفراد) + بحث */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-line bg-card p-0.5">
          {(["ALL", "CORPORATE", "INDIVIDUAL"] as Tab[]).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={["rounded-md px-3.5 py-1.5 text-[12.5px] font-medium transition-colors", tab === k ? "bg-primary-soft text-primary-strong" : "text-muted hover:text-ink"].join(" ")}
            >
              {t(`clients.tabs.${k.toLowerCase()}`)} <span className="text-[11px] text-subtle tnum">{counts[k]}</span>
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-80">
          <Search size={15} className="pointer-events-none absolute inset-y-0 my-auto h-4 w-4 text-subtle ltr:left-3 rtl:right-3" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("clients.searchPlaceholder")}
            className="h-9 w-full rounded-lg border border-line bg-card text-[13px] text-ink placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-primary/30 ltr:pl-9 ltr:pr-3 rtl:pr-9 rtl:pl-3"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-card shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
                <th className="px-5 py-3 text-start font-semibold">{t("clients.code")}</th>
                <th className="px-5 py-3 text-start font-semibold">{t("clients.table.client")}</th>
                <th className="px-5 py-3 text-start font-semibold">{t("clients.table.idNumber")}</th>
                <th className="px-5 py-3 text-start font-semibold">{t("clients.table.phone")}</th>
                <th className="px-5 py-3 text-start font-semibold">{t("clients.table.city")}</th>
                <th className="px-5 py-3 text-start font-semibold">{t("clients.compliance")}</th>
                <th className="px-5 py-3 text-start font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-surface-2/60">
                  <td className="px-5 py-3 text-[12px] text-subtle tnum">{c.code ?? "—"}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${c.type === "CORPORATE" ? "bg-info-soft text-info" : "bg-primary-soft text-primary"}`}>
                        {c.type === "CORPORATE" ? <Building2 size={16} /> : <User size={16} />}
                      </span>
                      <div>
                        <div className="text-[13.5px] font-medium text-ink">{c.name}</div>
                        <div className="text-[11px] text-subtle">{t(`clients.tabs.${c.type.toLowerCase()}`)}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-[12.5px] text-muted tnum">{c.crNumber ?? c.nationalId ?? "—"}</td>
                  <td className="px-5 py-3 text-[12.5px] text-muted tnum">{c.phone ?? "—"}</td>
                  <td className="px-5 py-3 text-[12.5px] text-muted">{c.city ?? "—"}</td>
                  <td className="px-5 py-3">
                    <Badge tone={COMPLIANCE_TONE[c.complianceStatus]}>{t(`clients.complianceStatus.${c.complianceStatus}`)}</Badge>
                  </td>
                  <td className="px-5 py-3">
                    {c.complianceStatus === "PENDING" ? (
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => verify(c)} disabled={verifying === c.id} title={t("clients.verify.button")} className="inline-flex items-center gap-1 rounded-md border border-line bg-card px-2 py-1.5 text-[11.5px] font-medium text-primary hover:bg-surface-2 disabled:opacity-60">
                          <BadgeCheck size={14} /> {verifying === c.id ? "…" : t("clients.verify.button")}
                        </button>
                        <button onClick={() => decide(c.id, "APPROVED")} title={t("clients.approve")} className="grid h-7 w-7 place-items-center rounded-md bg-success-soft text-success hover:opacity-80">
                          <Check size={15} />
                        </button>
                        <button onClick={() => decide(c.id, "REJECTED")} title={t("clients.reject")} className="grid h-7 w-7 place-items-center rounded-md bg-danger-soft text-danger hover:opacity-80">
                          <Ban size={15} />
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-[13px] text-subtle">{t("clients.noResults")}</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-muted">{label}</span>
      <input type={type} value={value} required={required} onChange={(e) => onChange(e.target.value)} className="h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30" />
    </label>
  );
}
