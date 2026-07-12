"use client";

import { useEffect, useState } from "react";
import { Building2, User, Save, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { cpapi, ApiError } from "@/lib/api";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

interface Me {
  id: string; code: string | null; name: string; type: "CORPORATE" | "INDIVIDUAL";
  crNumber: string | null; nationalId: string | null; vatNumber: string | null;
  email: string | null; phone: string | null; landline: string | null; contactName: string | null;
  city: string | null; nationalAddress: string | null; complianceStatus: "PENDING" | "APPROVED" | "REJECTED";
}
const COMPLIANCE_TONE: Record<string, BadgeTone> = { APPROVED: "success", PENDING: "warning", REJECTED: "danger" };

export default function PortalAccount() {
  const t = useTranslations();
  const [me, setMe] = useState<Me | null>(null);
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [landline, setLandline] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  function hydrate(m: Me) {
    setMe(m); setContactName(m.contactName ?? ""); setPhone(m.phone ?? ""); setLandline(m.landline ?? ""); setEmail(m.email ?? "");
  }
  useEffect(() => { void cpapi<Me>("/portal/me").then(hydrate).catch(() => undefined); }, []);

  const digits = (v: string) => v.replace(/\D/g, "");
  async function save() {
    setBusy(true); setErr(""); setMsg("");
    try {
      const updated = await cpapi<Me>("/portal/me", { method: "PUT", body: JSON.stringify({
        contactName: contactName || undefined, phone: phone || undefined, landline: landline || undefined, email: email || undefined,
      }) });
      hydrate(updated); setMsg(t("portal.account.saved"));
    } catch (e) { setErr(e instanceof ApiError ? (e.details?.[0] ?? e.message) : "خطأ"); }
    finally { setBusy(false); }
  }

  if (!me) return <PortalShell><div className="grid min-h-[40vh] place-items-center text-subtle">…</div></PortalShell>;
  const isCo = me.type === "CORPORATE";
  const dirty = contactName !== (me.contactName ?? "") || phone !== (me.phone ?? "") || landline !== (me.landline ?? "") || email !== (me.email ?? "");

  return (
    <PortalShell>
      <PageHeader title={t("portal.account.title")} subtitle={t("portal.account.subtitle")} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* بيانات مُتحقَّقة (للعرض فقط) */}
        <section className="overflow-hidden rounded-card border border-line bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-line bg-surface-2/40 px-4 py-2.5">
            <h2 className="flex items-center gap-2 text-[13px] font-bold text-ink">{isCo ? <Building2 size={15} className="text-primary" /> : <User size={15} className="text-primary" />} {t("portal.account.identity")}</h2>
            <Badge tone={COMPLIANCE_TONE[me.complianceStatus]}>{t(`clients.complianceStatus.${me.complianceStatus}`)}</Badge>
          </div>
          <dl className="divide-y divide-line/70 px-4 py-1 text-[12.5px]">
            <Row label={t("portal.account.name")} value={me.name} strong />
            <Row label={t("portal.account.code")} value={me.code} mono />
            {isCo ? <Row label={t("portal.account.cr")} value={me.crNumber} mono /> : <Row label={t("portal.account.nationalId")} value={me.nationalId} mono />}
            {me.vatNumber ? <Row label={t("portal.account.vat")} value={me.vatNumber} mono /> : null}
            <Row label={t("portal.account.city")} value={me.city} />
            <Row label={t("portal.account.address")} value={me.nationalAddress} />
          </dl>
          <p className="border-t border-line px-4 py-2.5 text-[11px] text-subtle"><ShieldCheck size={11} className="me-1 inline" /> {t("portal.account.verifiedHint")}</p>
        </section>

        {/* بيانات التواصل (قابلة للتعديل) */}
        <section className="rounded-card border border-line bg-card p-5 shadow-card">
          <h2 className="mb-3 text-[13px] font-bold text-ink">{t("portal.account.contact")}</h2>
          <div className="space-y-3">
            <Field label={t("portal.account.contactName")} value={contactName} onChange={setContactName} />
            <Field label={t("portal.account.phone")} value={phone} onChange={(v) => setPhone(digits(v).slice(0, 10))} mono placeholder="05XXXXXXXX" hint={t("portal.account.phoneHint")} />
            <Field label={t("portal.account.landline")} value={landline} onChange={(v) => setLandline(digits(v).slice(0, 10))} mono placeholder="011XXXXXXX" hint={t("portal.account.landlineHint")} />
            <Field label={t("portal.account.email")} value={email} onChange={setEmail} mono type="email" />
            {err ? <p className="text-[12px] font-medium text-danger">{err}</p> : null}
            {msg ? <p className="text-[12px] font-medium text-success">{msg}</p> : null}
            <button onClick={save} disabled={busy || !dirty} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-strong px-4 text-[12.5px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-50"><Save size={14} /> {busy ? "…" : t("portal.account.save")}</button>
          </div>
        </section>
      </div>
    </PortalShell>
  );
}

function Row({ label, value, strong, mono }: { label: string; value: string | null; strong?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="shrink-0 text-subtle">{label}</dt>
      <dd className={["min-w-0 truncate text-end", strong ? "font-semibold text-ink" : "text-ink", mono ? "tnum" : ""].join(" ")} dir={mono ? "ltr" : undefined}>{value ?? "—"}</dd>
    </div>
  );
}

function Field({ label, value, onChange, mono, type = "text", placeholder, hint }: { label: string; value: string; onChange: (v: string) => void; mono?: boolean; type?: string; placeholder?: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-medium text-muted">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} dir={mono ? "ltr" : undefined} className={["h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30", mono ? "tnum" : ""].join(" ")} />
      {hint ? <span className="mt-0.5 block text-[10.5px] text-subtle">{hint}</span> : null}
    </label>
  );
}
