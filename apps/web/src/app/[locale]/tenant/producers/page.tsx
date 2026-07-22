"use client";

import { useCallback, useEffect, useState } from "react";
import { Handshake, Users, Wallet2, Clock, UserPlus, X, Check, Banknote, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "@/lib/api";
import { Link } from "@/i18n/routing";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";

interface Row { id: string; code: string | null; name: string; type: string | null; licenseNo: string | null; commissionRate: string | null; status: string | null; policies: number; grossPremium: number; commissionOwed: number; paid: number; outstanding: number }
interface ListData { summary: { producers: number; active: number; commissionOwed: number; paid: number; outstanding: number }; rows: Row[] }

export default function ProducersPage() {
  const t = useTranslations("producers");
  const tg = useTranslations();
  const { can } = usePermissions();
  const canCreate = can("finance", "create");
  const [d, setD] = useState<ListData | null>(null);
  const [openId, setOpenId] = useState("");
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState("");
  const load = useCallback(() => { void api<ListData>("/producers").then(setD).catch(() => undefined); }, []);
  useEffect(() => { load(); }, [load]);

  const fmt = (n: string | number | null) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
  const s = d?.summary;

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} actions={canCreate ? <button onClick={() => { setMsg(""); setCreating(true); }} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-strong px-3.5 text-[12.5px] font-semibold text-primary-fg hover:bg-primary"><UserPlus size={15} /> {t("add")}</button> : null} />
      {msg ? <p className="rounded-lg bg-success-soft px-3 py-2 text-[12.5px] font-medium text-success">{msg}</p> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="primary" icon={<Users size={18} />} title={t("kpi.count")} value={<span className="tnum">{s ? s.producers : "…"}</span>} sub={s ? `${s.active} ${t("kpi.active")}` : ""} />
        <StatCard tone="warning" icon={<Clock size={18} />} title={t("kpi.owed")} value={<span className="tnum">{s ? fmt(s.commissionOwed) : "…"}</span>} sub={tg("common.sar")} />
        <StatCard tone="success" icon={<Wallet2 size={18} />} title={t("kpi.paid")} value={<span className="tnum">{s ? fmt(s.paid) : "…"}</span>} sub={tg("common.sar")} />
        <StatCard tone="danger" icon={<Banknote size={18} />} title={t("kpi.outstanding")} value={<span className="tnum">{s ? fmt(s.outstanding) : "…"}</span>} sub={tg("common.sar")} />
      </div>

      <section className="overflow-hidden rounded-card border border-line bg-card shadow-card">
        <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
          <Handshake size={17} className="text-primary" />
          <h2 className="text-[15px] font-semibold text-ink">{t("registry")}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px]">
            <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
              <th className="px-5 py-3 text-start font-semibold">{t("col.code")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("col.name")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("col.license")}</th>
              <th className="px-5 py-3 text-end font-semibold">{t("col.rate")}</th>
              <th className="px-5 py-3 text-end font-semibold">{t("col.policies")}</th>
              <th className="px-5 py-3 text-end font-semibold">{t("col.owed")}</th>
              <th className="px-5 py-3 text-end font-semibold">{t("col.outstanding")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("col.status")}</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {d?.rows.map((r) => (
                <tr key={r.id} onClick={() => setOpenId(r.id)} className="cursor-pointer transition-colors hover:bg-surface-2/60">
                  <td className="px-5 py-3 text-[12px] font-medium text-ink tnum">{r.code ?? "—"}</td>
                  <td className="px-5 py-3 text-[13px] font-medium text-ink">{r.name} {r.type === "COMPANY" ? <span className="text-[10px] text-subtle">🏢</span> : null}</td>
                  <td className="px-5 py-3 text-[12px] text-muted tnum">{r.licenseNo ?? "—"}</td>
                  <td className="px-5 py-3 text-end text-[13px] text-muted tnum">{r.commissionRate ? `${Number(r.commissionRate)}%` : "—"}</td>
                  <td className="px-5 py-3 text-end text-[13px] text-muted tnum">{r.policies}</td>
                  <td className="px-5 py-3 text-end text-[13px] text-ink tnum">{fmt(r.commissionOwed)}</td>
                  <td className={`px-5 py-3 text-end text-[13px] tnum ${r.outstanding > 0 ? "font-medium text-warning" : "text-subtle"}`}>{fmt(r.outstanding)}</td>
                  <td className="px-5 py-3"><Badge tone={r.status === "suspended" ? "danger" : "success"}>{r.status === "suspended" ? t("status.suspended") : t("status.active")}</Badge></td>
                </tr>
              ))}
              {d && d.rows.length === 0 ? <tr><td colSpan={8} className="px-5 py-10 text-center text-[13px] text-subtle">{t("empty")}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      {openId ? <ProducerDetail id={openId} onClose={() => setOpenId("")} onChanged={() => { load(); }} /> : null}
      {creating ? <CreateProducer onClose={() => setCreating(false)} onDone={(name) => { setCreating(false); setMsg(t("created", { name })); load(); }} /> : null}
    </div>
  );
}

interface DetailData {
  producer: { id: string; code: string | null; name: string; type: string | null; licenseNo: string | null; crNumber: string | null; nationalId: string | null; email: string | null; phone: string | null; iban: string | null; commissionRate: string | null; status: string | null; notes: string | null };
  policies: Array<{ id: string; sequenceNo: string | null; clientId: string | null; clientName: string; insurerName: string | null; totalPremium: string | null; producerCommission: string | null; status: string; createdAt: string }>;
  settlements: Array<{ id: string; sequenceNo: string | null; amount: string; createdAt: string }>;
  ledger: { policies: number; grossPremium: number; commissionOwed: number; paid: number; outstanding: number };
}

function ProducerDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const t = useTranslations("producers");
  const canSettle = usePermissions().can("finance", "edit");
  const [d, setD] = useState<DetailData | null>(null);
  const [settling, setSettling] = useState(false);
  const load = useCallback(() => { void api<DetailData>(`/producers/${id}`).then(setD).catch(() => undefined); }, [id]);
  useEffect(() => { load(); }, [load]);
  const fmt = (n: string | number | null) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
  const dt = (s: string) => new Date(s).toLocaleDateString("en-GB");
  const p = d?.producer;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-card border border-line bg-card p-5 shadow-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-[16px] font-bold text-ink">{p?.name ?? "…"} {p?.type === "COMPANY" ? "🏢" : ""}</h2>
            <p className="text-[12px] text-subtle tnum">{p?.code} · {p?.licenseNo ? <><ShieldCheck size={11} className="inline text-success" /> {p.licenseNo}</> : t("noLicense")}</p>
          </div>
          <button onClick={onClose} className="text-subtle hover:text-ink"><X size={18} /></button>
        </div>

        {d ? (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label={t("col.policies")} value={String(d.ledger.policies)} />
              <Stat label={t("kpi.owed")} value={fmt(d.ledger.commissionOwed)} />
              <Stat label={t("kpi.paid")} value={fmt(d.ledger.paid)} tone="success" />
              <Stat label={t("kpi.outstanding")} value={fmt(d.ledger.outstanding)} tone={d.ledger.outstanding > 0 ? "warning" : undefined} />
            </div>

            <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 rounded-lg bg-surface-2/50 px-4 py-3 text-[12px]">
              {([["rate", p?.commissionRate ? `${Number(p.commissionRate)}%` : "—"], ["iban", p?.iban], ["phone", p?.phone], ["email", p?.email], ["cr", p?.crNumber], ["nid", p?.nationalId]] as const).filter(([, v]) => v).map(([k, v]) => (
                <span key={k} className="text-subtle">{t(`field.${k}`)}: <span className="text-ink tnum">{v}</span></span>
              ))}
            </div>

            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-ink">{t("theirPolicies")} <span className="text-subtle">({d.policies.length})</span></h3>
              {canSettle && d.ledger.outstanding > 0 ? <button onClick={() => setSettling(true)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary-strong px-3 text-[12px] font-semibold text-primary-fg hover:bg-primary"><Banknote size={14} /> {t("settle.action")}</button> : null}
            </div>
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full min-w-[520px] text-[12.5px]">
                <thead><tr className="border-b border-line bg-surface-2/40 text-[10.5px] uppercase text-subtle">
                  <th className="px-3 py-2 text-start font-semibold">{t("col.policy")}</th>
                  <th className="px-3 py-2 text-start font-semibold">{t("col.client")}</th>
                  <th className="px-3 py-2 text-end font-semibold">{t("col.premium")}</th>
                  <th className="px-3 py-2 text-end font-semibold">{t("col.share")}</th>
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {d.policies.map((pol) => (
                    <tr key={pol.id}>
                      <td className="px-3 py-2 tnum"><Link href={`/tenant/policies/${pol.id}`} className="font-medium text-primary hover:underline">{pol.sequenceNo ?? "—"}</Link></td>
                      <td className="px-3 py-2">{pol.clientId ? <Link href={`/tenant/clients/${pol.clientId}`} className="text-primary hover:underline">{pol.clientName}</Link> : <span className="text-muted">{pol.clientName}</span>}</td>
                      <td className="px-3 py-2 text-end tnum text-muted">{fmt(pol.totalPremium)}</td>
                      <td className="px-3 py-2 text-end tnum font-medium text-ink">{fmt(pol.producerCommission)}</td>
                    </tr>
                  ))}
                  {d.policies.length === 0 ? <tr><td colSpan={4} className="px-3 py-6 text-center text-subtle">{t("noPolicies")}</td></tr> : null}
                </tbody>
              </table>
            </div>

            {d.settlements.length ? (
              <div className="mt-4">
                <h3 className="mb-2 text-[13px] font-semibold text-ink">{t("settlements")} <span className="text-subtle">({d.settlements.length})</span></h3>
                <div className="space-y-1.5">
                  {d.settlements.map((v) => (
                    <div key={v.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-[12px]">
                      <span className="tnum text-muted">{v.sequenceNo}</span>
                      <span className="tnum font-medium text-success">{fmt(v.amount)}</span>
                      <span className="tnum text-subtle">{dt(v.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : <p className="py-8 text-center text-[13px] text-subtle">…</p>}

        {settling && d ? <SettleProducer id={id} outstanding={d.ledger.outstanding} name={d.producer.name} onClose={() => setSettling(false)} onDone={() => { setSettling(false); load(); onChanged(); }} /> : null}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "success" | "warning" }) {
  const color = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-ink";
  return <div className="rounded-lg border border-line bg-card px-3 py-2.5"><p className="text-[10.5px] text-subtle">{label}</p><p className={`text-[15px] font-bold tnum ${color}`}>{value}</p></div>;
}

function SettleProducer({ id, outstanding, name, onClose, onDone }: { id: string; outstanding: number; name: string; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("producers.settle");
  const [amount, setAmount] = useState(String(outstanding));
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const field = "h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30";

  async function save() {
    setErr(""); setSaving(true);
    try {
      await api(`/producers/${id}/settle`, { method: "POST", body: JSON.stringify({ amount: Number(amount), reference: reference || undefined }) });
      onDone();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "خطأ"); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-sm rounded-card border border-line bg-card p-5 shadow-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between"><h2 className="text-[15px] font-bold text-ink">{t("title")}</h2><button onClick={onClose} className="text-subtle hover:text-ink"><X size={18} /></button></div>
        <p className="mb-3 text-[12px] text-subtle">{name} · {t("outstanding")}: <span className="tnum text-ink">{outstanding.toLocaleString("en-US")}</span></p>
        <div className="space-y-3">
          <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("amount")}</span><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${field} tnum`} /></label>
          <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("reference")}</span><input value={reference} onChange={(e) => setReference(e.target.value)} className={field} /></label>
          {err ? <p className="text-[12px] font-medium text-danger">{err}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="h-9 rounded-lg border border-line px-3 text-[12.5px] font-medium text-muted hover:bg-surface-2">{t("cancel")}</button>
            <button onClick={save} disabled={saving || !(Number(amount) > 0)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-strong px-4 text-[12.5px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60"><Check size={15} /> {saving ? "…" : t("submit")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateProducer({ onClose, onDone }: { onClose: () => void; onDone: (name: string) => void }) {
  const t = useTranslations("producers");
  const [f, setF] = useState<{ name: string; type: string; licenseNo: string; crNumber: string; phone: string; iban: string; commissionRate: string }>({ name: "", type: "INDIVIDUAL", licenseNo: "", crNumber: "", phone: "", iban: "", commissionRate: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const field = "h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30";
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setErr(""); setSaving(true);
    try {
      await api("/producers", { method: "POST", body: JSON.stringify({ name: f.name, type: f.type, licenseNo: f.licenseNo || undefined, crNumber: f.crNumber || undefined, phone: f.phone || undefined, iban: f.iban || undefined, commissionRate: f.commissionRate ? Number(f.commissionRate) : undefined }) });
      onDone(f.name);
    } catch (e) { setErr(e instanceof ApiError ? e.message : "خطأ"); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-md rounded-card border border-line bg-card p-5 shadow-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-[15px] font-bold text-ink">{t("add")}</h2><button onClick={onClose} className="text-subtle hover:text-ink"><X size={18} /></button></div>
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("field.name")} *</span><input value={f.name} onChange={set("name")} className={field} /></label>
          <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("field.type")}</span><select value={f.type} onChange={set("type")} className={field}><option value="INDIVIDUAL">{t("type.individual")}</option><option value="COMPANY">{t("type.company")}</option></select></label>
          <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("field.rate")}</span><input type="number" value={f.commissionRate} onChange={set("commissionRate")} className={`${field} tnum`} placeholder="%" /></label>
          <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("field.license")}</span><input value={f.licenseNo} onChange={set("licenseNo")} className={field} /></label>
          <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("field.cr")}</span><input value={f.crNumber} onChange={set("crNumber")} className={field} /></label>
          <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("field.phone")}</span><input value={f.phone} onChange={set("phone")} className={field} /></label>
          <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("field.iban")}</span><input value={f.iban} onChange={set("iban")} className={field} /></label>
        </div>
        {err ? <p className="mt-2 text-[12px] font-medium text-danger">{err}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="h-9 rounded-lg border border-line px-3 text-[12.5px] font-medium text-muted hover:bg-surface-2">{t("settle.cancel")}</button>
          <button onClick={save} disabled={saving || !f.name.trim()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-strong px-4 text-[12.5px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60"><Check size={15} /> {saving ? "…" : t("save")}</button>
        </div>
      </div>
    </div>
  );
}
