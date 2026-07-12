"use client";

import { useCallback, useEffect, useState } from "react";
import { Umbrella, Plus, Pencil, Trash2, Check, X, Building2, Landmark, Percent, CalendarClock, FileCheck2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";

interface Stats { count: number; grossPremium: number; commission: number }
interface Insurer {
  id: string; name: string; nameEn: string | null; code: string | null; licenseNo: string | null;
  commissionRate: number | null; settlementDays: number | null; bankName: string | null; iban: string | null;
  contactName: string | null; contactEmail: string | null; contactPhone: string | null; notes: string | null;
  status: string; stats: Stats;
}

const empty = { name: "", nameEn: "", code: "", licenseNo: "", commissionRate: "", settlementDays: "", bankName: "", iban: "", contactName: "", contactEmail: "", contactPhone: "", notes: "", status: "active" };

export default function InsurersPage() {
  const t = useTranslations("insurers");
  const [list, setList] = useState<Insurer[]>([]);
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => { setList(await api<Insurer[]>("/insurers")); }, []);
  useEffect(() => { void load().catch(() => undefined); }, [load]);

  const openNew = () => { setEditId(null); setForm({ ...empty }); setError(""); };
  const openEdit = (i: Insurer) => {
    setEditId(i.id);
    setForm({ name: i.name, nameEn: i.nameEn ?? "", code: i.code ?? "", licenseNo: i.licenseNo ?? "", commissionRate: i.commissionRate != null ? String(i.commissionRate) : "", settlementDays: i.settlementDays != null ? String(i.settlementDays) : "", bankName: i.bankName ?? "", iban: i.iban ?? "", contactName: i.contactName ?? "", contactEmail: i.contactEmail ?? "", contactPhone: i.contactPhone ?? "", notes: i.notes ?? "", status: i.status });
    setError("");
  };

  async function save() {
    if (!form) return;
    setError(""); setNotice("");
    const body: Record<string, unknown> = { name: form.name, nameEn: form.nameEn, code: form.code, licenseNo: form.licenseNo, bankName: form.bankName, iban: form.iban, contactName: form.contactName, contactPhone: form.contactPhone, notes: form.notes, status: form.status };
    if (form.contactEmail) body.contactEmail = form.contactEmail;
    if (form.commissionRate) body.commissionRate = Number(form.commissionRate);
    if (form.settlementDays) body.settlementDays = Number(form.settlementDays);
    try {
      if (editId) await api(`/insurers/${editId}`, { method: "PUT", body: JSON.stringify(body) });
      else await api("/insurers", { method: "POST", body: JSON.stringify(body) });
      setNotice(editId ? t("updated") : t("created")); setForm(null); setEditId(null); await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : t("error")); }
  }
  async function remove(id: string) {
    if (!confirm(t("confirmDelete"))) return;
    try { await api(`/insurers/${id}`, { method: "DELETE" }); await load(); } catch { setError(t("error")); }
  }

  const fmt = (n: number) => n.toLocaleString("en-US");
  const field = "h-9 w-full rounded-lg border border-line bg-card px-2.5 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/25";
  const set = (k: string, v: string) => setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <div className="space-y-4">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      {error ? <p className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}
      {notice ? <p className="rounded-lg bg-success-soft px-3 py-2 text-[12.5px] font-medium text-success">{notice}</p> : null}

      {!form ? (
        <button onClick={openNew} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary-strong px-4 text-[13px] font-semibold text-primary-fg hover:bg-primary"><Plus size={16} /> {t("add")}</button>
      ) : (
        <section className="rounded-card border border-line bg-card p-5 shadow-card">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <L label={t("name")}><input value={form.name} onChange={(e) => set("name", e.target.value)} className={field} /></L>
            <L label={t("nameEn")}><input dir="ltr" value={form.nameEn} onChange={(e) => set("nameEn", e.target.value)} className={field} /></L>
            <L label={t("licenseNo")}><input dir="ltr" value={form.licenseNo} onChange={(e) => set("licenseNo", e.target.value)} className={field} /></L>
            <L label={t("commissionRate")}><input type="number" min={0} max={100} step="0.1" value={form.commissionRate} onChange={(e) => set("commissionRate", e.target.value)} className={`${field} tnum`} /></L>
            <L label={t("settlementDays")}><input type="number" min={0} max={365} value={form.settlementDays} onChange={(e) => set("settlementDays", e.target.value)} className={`${field} tnum`} /></L>
            <L label={t("status")}><select value={form.status} onChange={(e) => set("status", e.target.value)} className={field}><option value="active">{t("active")}</option><option value="inactive">{t("inactive")}</option></select></L>
            <L label={t("bankName")}><input value={form.bankName} onChange={(e) => set("bankName", e.target.value)} className={field} /></L>
            <L label={t("iban")}><input dir="ltr" value={form.iban} onChange={(e) => set("iban", e.target.value)} className={`${field} tnum`} /></L>
            <L label={t("contactName")}><input value={form.contactName} onChange={(e) => set("contactName", e.target.value)} className={field} /></L>
            <L label={t("contactEmail")}><input dir="ltr" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} className={field} /></L>
            <L label={t("contactPhone")}><input dir="ltr" value={form.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} className={`${field} tnum`} /></L>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button onClick={save} disabled={!form.name.trim()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-strong px-4 text-[12.5px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60"><Check size={15} /> {t("save")}</button>
            <button onClick={() => { setForm(null); setEditId(null); }} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[12.5px] font-medium text-muted hover:bg-surface-2"><X size={14} /> {t("cancel")}</button>
          </div>
        </section>
      )}

      {list.length === 0 && !form ? (
        <div className="rounded-card border border-dashed border-line bg-card py-12 text-center text-[13px] text-subtle">{t("empty")}</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {list.map((i) => (
            <div key={i.id} className="rounded-card border border-line bg-card p-4 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[14.5px] font-bold text-ink">{i.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${i.status === "active" ? "bg-success-soft text-success" : "bg-surface-2 text-subtle"}`}>{t(i.status === "active" ? "active" : "inactive")}</span>
                  </div>
                  {i.nameEn ? <div className="text-[11.5px] text-subtle" dir="ltr">{i.nameEn}</div> : null}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(i)} className="rounded-md border border-line p-1.5 text-subtle hover:bg-surface-2 hover:text-ink"><Pencil size={13} /></button>
                  <button onClick={() => remove(i.id)} className="rounded-md border border-line p-1.5 text-subtle hover:bg-danger-soft hover:text-danger"><Trash2 size={13} /></button>
                </div>
              </div>

              {/* الإنتاج الفعلي */}
              <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-surface-2/50 p-2.5 text-center">
                <div><div className="inline-flex items-center gap-1 text-[10.5px] text-subtle"><FileCheck2 size={11} /> {t("policies")}</div><div className="text-[14px] font-bold text-ink tnum">{i.stats.count}</div></div>
                <div><div className="text-[10.5px] text-subtle">{t("grossPremium")}</div><div className="text-[13px] font-bold text-ink tnum">{fmt(i.stats.grossPremium)}</div></div>
                <div><div className="text-[10.5px] text-subtle">{t("commission")}</div><div className="text-[13px] font-bold text-success tnum">{fmt(i.stats.commission)}</div></div>
              </div>

              {/* الاتفاقية والبنك */}
              <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted">
                {i.commissionRate != null ? <span className="inline-flex items-center gap-1"><Percent size={12} className="text-primary" /> {i.commissionRate}%</span> : null}
                {i.settlementDays != null ? <span className="inline-flex items-center gap-1"><CalendarClock size={12} className="text-primary" /> {t("settlementInfo", { days: i.settlementDays })}</span> : null}
                {i.bankName || i.iban ? <span className="inline-flex items-center gap-1" dir="ltr"><Landmark size={12} className="text-primary" /> {i.bankName ?? ""} {i.iban ?? ""}</span> : null}
                {i.licenseNo ? <span className="inline-flex items-center gap-1" dir="ltr"><Building2 size={12} className="text-primary" /> {i.licenseNo}</span> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{label}</span>{children}</label>;
}
