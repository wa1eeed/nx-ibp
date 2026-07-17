"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldAlert, ScanSearch, FileWarning, X, AlertTriangle, Gauge, UserCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

type Tab = "clients" | "screening" | "str";

const FACTORS = ["sanctionsHit", "pep", "highRiskCountry", "complexStructure", "cashIntensive", "adverseMedia", "nonResident"] as const;
const LEVELS = ["low", "medium", "high"] as const;
const INDICATORS = ["unusual_volume", "structuring", "third_party_payment", "high_risk_jurisdiction", "pep_involvement", "adverse_media", "inconsistent_activity", "refusal_of_info", "other"] as const;
const STR_STATUSES = ["draft", "filed", "closed"] as const;

const levelTone: Record<string, BadgeTone> = { low: "success", medium: "warning", high: "danger" };
const resultTone: Record<string, BadgeTone> = { clear: "success", potential_match: "warning", confirmed_match: "danger" };
const dispTone: Record<string, BadgeTone> = { pending: "warning", cleared: "success", escalated: "danger" };
const strTone: Record<string, BadgeTone> = { draft: "neutral", filed: "info", closed: "success" };

interface AmlClient { id: string; name: string; type: string; complianceStatus: string; amlRiskLevel: string | null; amlRiskScore: number | null; amlReviewDue: string | null; assessed: boolean; reviewOverdue: boolean }
interface Screening { id: string; screenedName: string; clientName: string | null; lists: string; result: string; matches: Array<{ list: string; matchedName: string; score: number; type: string }> | null; disposition: string; createdAt: string }
interface Str { id: string; sequenceNo: string | null; subject: string; clientName: string | null; indicators: string[]; status: string; reference: string | null; createdAt: string }
interface Overview { riskDistribution: Array<{ level: string; count: number }>; unassessed: number; reviewOverdue: number; screeningsByResult: Array<{ result: string; count: number }>; pendingDispositions: number; strByStatus: Array<{ status: string; count: number }> }

export default function AmlPage() {
  const t = useTranslations("aml");
  const [tab, setTab] = useState<Tab>("clients");
  const [ov, setOv] = useState<Overview | null>(null);
  const loadOv = useCallback(() => { void api<Overview>("/aml/overview").then(setOv).catch(() => undefined); }, []);
  useEffect(() => { loadOv(); }, [loadOv]);

  const high = ov?.riskDistribution.find((r) => r.level === "high")?.count ?? 0;
  const strOpen = ov ? (ov.strByStatus.find((s) => s.status === "draft")?.count ?? 0) + (ov.strByStatus.find((s) => s.status === "filed")?.count ?? 0) : 0;

  const TABS: Array<{ key: Tab; icon: typeof ShieldAlert; label: string }> = [
    { key: "clients", icon: Gauge, label: t("tab.clients") },
    { key: "screening", icon: ScanSearch, label: t("tab.screening") },
    { key: "str", icon: FileWarning, label: t("tab.str") },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard tone="danger" icon={<ShieldAlert size={18} />} title={t("kpi.high")} value={ov ? high : "…"} />
        <StatCard tone="warning" icon={<UserCheck size={18} />} title={t("kpi.unassessed")} value={ov?.unassessed ?? "…"} />
        <StatCard tone="warning" icon={<AlertTriangle size={18} />} title={t("kpi.reviewOverdue")} value={ov?.reviewOverdue ?? "…"} />
        <StatCard tone="info" icon={<ScanSearch size={18} />} title={t("kpi.pendingDisp")} value={ov?.pendingDispositions ?? "…"} />
        <StatCard tone="primary" icon={<FileWarning size={18} />} title={t("kpi.strOpen")} value={ov ? strOpen : "…"} />
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-line">
        {TABS.map((tb) => {
          const Icon = tb.icon; const active = tab === tb.key;
          return (
            <button key={tb.key} onClick={() => setTab(tb.key)} className={`inline-flex items-center gap-1.5 rounded-t-lg px-4 py-2.5 text-[13px] font-medium ${active ? "border-b-2 border-primary text-primary" : "text-muted hover:text-ink"}`}>
              <Icon size={15} /> {tb.label}
            </button>
          );
        })}
      </div>

      {tab === "clients" ? <ClientsTab onChanged={loadOv} /> : null}
      {tab === "screening" ? <ScreeningTab onChanged={loadOv} /> : null}
      {tab === "str" ? <StrTab onChanged={loadOv} /> : null}
    </div>
  );
}

// ── سجلّ المخاطر ─────────────────────────────────────────────────────────────
function ClientsTab({ onChanged }: { onChanged: () => void }) {
  const t = useTranslations("aml");
  const [rows, setRows] = useState<AmlClient[]>([]);
  const [level, setLevel] = useState("");
  const [assess, setAssess] = useState<AmlClient | null>(null);
  const load = useCallback(() => {
    const q = level ? `?level=${level}` : "";
    void api<AmlClient[]>(`/aml/clients${q}`).then(setRows).catch(() => setRows([]));
  }, [level]);
  useEffect(() => { load(); }, [load]);
  const dt = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-GB") : "—");
  const selCls = "h-9 rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <select value={level} onChange={(e) => setLevel(e.target.value)} className={selCls}><option value="">{t("filter.allLevels")}</option>{LEVELS.map((l) => <option key={l} value={l}>{t(`level.${l}`)}</option>)}</select>
      </div>
      <section className="overflow-hidden rounded-card border border-line bg-card shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
              <th className="px-5 py-3 text-start font-semibold">{t("col.client")}</th>
              <th className="px-4 py-3 text-center font-semibold">{t("col.level")}</th>
              <th className="px-4 py-3 text-center font-semibold">{t("col.score")}</th>
              <th className="px-4 py-3 text-center font-semibold">{t("col.reviewDue")}</th>
              <th className="px-4 py-3 text-end font-semibold"></th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-surface-2/60">
                  <td className="px-5 py-3 text-[13px] text-ink">{c.name} <span className="text-[11px] text-subtle">· {t(`clientType.${c.type}`)}</span></td>
                  <td className="px-4 py-3 text-center">{c.amlRiskLevel ? <Badge tone={levelTone[c.amlRiskLevel] ?? "neutral"}>{t(`level.${c.amlRiskLevel}`)}</Badge> : <span className="text-[11.5px] text-subtle">{t("notAssessed")}</span>}</td>
                  <td className="px-4 py-3 text-center text-[12.5px] tnum text-muted">{c.amlRiskScore ?? "—"}</td>
                  <td className="px-4 py-3 text-center text-[12px] tnum">{c.reviewOverdue ? <span className="font-semibold text-danger">{dt(c.amlReviewDue)}</span> : <span className="text-subtle">{dt(c.amlReviewDue)}</span>}</td>
                  <td className="px-4 py-3 text-end"><button onClick={() => setAssess(c)} className="h-8 rounded-lg border border-line px-3 text-[12px] font-medium text-primary hover:bg-surface-2">{t("assess")}</button></td>
                </tr>
              ))}
              {rows.length === 0 ? <tr><td colSpan={5} className="px-5 py-10 text-center text-[13px] text-subtle">{t("emptyClients")}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
      {assess ? <AssessModal client={assess} onClose={() => setAssess(null)} onDone={() => { setAssess(null); load(); onChanged(); }} /> : null}
    </div>
  );
}

function AssessModal({ client, onClose, onDone }: { client: AmlClient; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("aml");
  const [factors, setFactors] = useState<Record<string, boolean>>({});
  const [rationale, setRationale] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const toggle = (k: string) => setFactors((f) => ({ ...f, [k]: !f[k] }));
  async function save() {
    setErr(""); setSaving(true);
    try { await api(`/aml/clients/${client.id}/assess`, { method: "POST", body: JSON.stringify({ factors, rationale: rationale.trim() || undefined }) }); onDone(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "خطأ"); setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-lg rounded-card border border-line bg-card p-5 shadow-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between"><h2 className="text-[15px] font-bold text-ink">{t("assessTitle")}</h2><button onClick={onClose} className="text-subtle hover:text-ink"><X size={18} /></button></div>
        <p className="mb-3 text-[12.5px] text-muted">{client.name}</p>
        <p className="mb-2 text-[11.5px] font-medium text-subtle">{t("factorsHint")}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {FACTORS.map((f) => (
            <label key={f} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] ${factors[f] ? "border-primary bg-primary-soft/40 text-ink" : "border-line text-muted hover:bg-surface-2"}`}>
              <input type="checkbox" checked={!!factors[f]} onChange={() => toggle(f)} className="accent-primary" /> {t(`factor.${f}`)}
            </label>
          ))}
        </div>
        <label className="mt-3 block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("rationale")}</span><textarea value={rationale} onChange={(e) => setRationale(e.target.value)} rows={2} className="w-full rounded-lg border border-line bg-card px-3 py-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30" /></label>
        {err ? <p className="mt-2 text-[12px] font-medium text-danger">{err}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="h-9 rounded-lg border border-line px-3 text-[12.5px] font-medium text-muted hover:bg-surface-2">{t("cancel")}</button>
          <button onClick={save} disabled={saving} className="h-9 rounded-lg bg-primary-strong px-4 text-[12.5px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60">{saving ? "…" : t("saveAssess")}</button>
        </div>
      </div>
    </div>
  );
}

// ── الفرز ────────────────────────────────────────────────────────────────────
function ScreeningTab({ onChanged }: { onChanged: () => void }) {
  const t = useTranslations("aml");
  const [rows, setRows] = useState<Screening[]>([]);
  const [name, setName] = useState("");
  const [running, setRunning] = useState(false);
  const load = useCallback(() => { void api<Screening[]>("/aml/screenings").then(setRows).catch(() => setRows([])); }, []);
  useEffect(() => { load(); }, [load]);
  async function run() {
    if (name.trim().length < 2) return;
    setRunning(true);
    try { await api("/aml/screen", { method: "POST", body: JSON.stringify({ name: name.trim() }) }); setName(""); load(); onChanged(); }
    finally { setRunning(false); }
  }
  async function dispose(id: string, disposition: string) {
    await api(`/aml/screenings/${id}/disposition`, { method: "PUT", body: JSON.stringify({ disposition }) }); load(); onChanged();
  }
  const field = "h-9 rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("screenPlaceholder")} className={`${field} w-64`} onKeyDown={(e) => e.key === "Enter" && run()} />
        <button onClick={run} disabled={running || name.trim().length < 2} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-strong px-4 text-[12.5px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60"><ScanSearch size={15} /> {running ? "…" : t("runScreen")}</button>
      </div>
      <section className="overflow-hidden rounded-card border border-line bg-card shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
              <th className="px-5 py-3 text-start font-semibold">{t("col.name")}</th>
              <th className="px-4 py-3 text-center font-semibold">{t("col.result")}</th>
              <th className="px-4 py-3 text-start font-semibold">{t("col.matches")}</th>
              <th className="px-4 py-3 text-center font-semibold">{t("col.disposition")}</th>
              <th className="px-4 py-3 text-end font-semibold"></th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((s) => (
                <tr key={s.id} className="hover:bg-surface-2/60">
                  <td className="px-5 py-3 text-[13px] text-ink">{s.screenedName}{s.clientName ? <span className="text-[11px] text-subtle"> · {s.clientName}</span> : null}</td>
                  <td className="px-4 py-3 text-center"><Badge tone={resultTone[s.result] ?? "neutral"}>{t(`result.${s.result}`)}</Badge></td>
                  <td className="px-4 py-3 text-[11.5px] text-muted">{s.matches?.length ? s.matches.map((m) => `${m.matchedName} (${m.list.toUpperCase()} ${m.score}%)`).join("، ") : "—"}</td>
                  <td className="px-4 py-3 text-center"><Badge tone={dispTone[s.disposition] ?? "neutral"}>{t(`disp.${s.disposition}`)}</Badge></td>
                  <td className="px-4 py-3 text-end">
                    {s.disposition === "pending" ? (
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => dispose(s.id, "cleared")} className="h-8 rounded-lg border border-line px-2.5 text-[11.5px] font-medium text-success hover:bg-surface-2">{t("clearFP")}</button>
                        <button onClick={() => dispose(s.id, "escalated")} className="h-8 rounded-lg border border-line px-2.5 text-[11.5px] font-medium text-danger hover:bg-surface-2">{t("escalate")}</button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? <tr><td colSpan={5} className="px-5 py-10 text-center text-[13px] text-subtle">{t("emptyScreen")}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ── بلاغات الاشتباه (STR) ────────────────────────────────────────────────────
function StrTab({ onChanged }: { onChanged: () => void }) {
  const t = useTranslations("aml");
  const [rows, setRows] = useState<Str[]>([]);
  const [showNew, setShowNew] = useState(false);
  const load = useCallback(() => { void api<Str[]>("/aml/reports").then(setRows).catch(() => setRows([])); }, []);
  useEffect(() => { load(); }, [load]);
  async function setStatus(id: string, status: string) { await api(`/aml/reports/${id}`, { method: "PUT", body: JSON.stringify({ status }) }); load(); onChanged(); }
  const dt = (s: string) => new Date(s).toLocaleDateString("en-GB");
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowNew(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-strong px-4 text-[12.5px] font-semibold text-primary-fg hover:bg-primary"><FileWarning size={15} /> {t("newStr")}</button>
      </div>
      <section className="overflow-hidden rounded-card border border-line bg-card shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
              <th className="px-5 py-3 text-start font-semibold">{t("col.no")}</th>
              <th className="px-4 py-3 text-start font-semibold">{t("col.subject")}</th>
              <th className="px-4 py-3 text-start font-semibold">{t("col.client")}</th>
              <th className="px-4 py-3 text-center font-semibold">{t("col.status")}</th>
              <th className="px-4 py-3 text-end font-semibold"></th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2/60">
                  <td className="px-5 py-3 text-[12.5px] font-medium tnum text-ink">{r.sequenceNo ?? r.id.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-[13px] text-ink">{r.subject}<div className="text-[10.5px] text-subtle">{dt(r.createdAt)}</div></td>
                  <td className="px-4 py-3 text-[12.5px] text-muted">{r.clientName ?? "—"}</td>
                  <td className="px-4 py-3 text-center"><Badge tone={strTone[r.status] ?? "neutral"}>{t(`strStatus.${r.status}`)}</Badge></td>
                  <td className="px-4 py-3 text-end">
                    <div className="flex justify-end gap-1.5">
                      {r.status === "draft" ? <button onClick={() => setStatus(r.id, "filed")} className="h-8 rounded-lg border border-line px-2.5 text-[11.5px] font-medium text-info hover:bg-surface-2">{t("file")}</button> : null}
                      {r.status === "filed" ? <button onClick={() => setStatus(r.id, "closed")} className="h-8 rounded-lg border border-line px-2.5 text-[11.5px] font-medium text-success hover:bg-surface-2">{t("close")}</button> : null}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? <tr><td colSpan={5} className="px-5 py-10 text-center text-[13px] text-subtle">{t("emptyStr")}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
      {showNew ? <NewStr onClose={() => setShowNew(false)} onDone={() => { setShowNew(false); load(); onChanged(); }} /> : null}
    </div>
  );
}

function NewStr({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const t = useTranslations("aml");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [indicators, setIndicators] = useState<string[]>([]);
  const [fileNow, setFileNow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const toggle = (k: string) => setIndicators((xs) => (xs.includes(k) ? xs.filter((x) => x !== k) : [...xs, k]));
  const field = "h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30";
  async function save() {
    setErr(""); setSaving(true);
    try { await api("/aml/reports", { method: "POST", body: JSON.stringify({ subject: subject.trim(), description: description.trim(), indicators, fileNow }) }); onDone(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "خطأ"); setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-lg rounded-card border border-line bg-card p-5 shadow-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-[15px] font-bold text-ink">{t("newStrTitle")}</h2><button onClick={onClose} className="text-subtle hover:text-ink"><X size={18} /></button></div>
        <div className="space-y-3">
          <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("col.subject")}</span><input value={subject} onChange={(e) => setSubject(e.target.value)} className={field} /></label>
          <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("description")}</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full rounded-lg border border-line bg-card px-3 py-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30" /></label>
          <div>
            <span className="mb-1.5 block text-[11.5px] font-medium text-muted">{t("indicators")}</span>
            <div className="flex flex-wrap gap-1.5">
              {INDICATORS.map((i) => (
                <button key={i} type="button" onClick={() => toggle(i)} className={`rounded-full border px-2.5 py-1 text-[11.5px] ${indicators.includes(i) ? "border-primary bg-primary-soft/50 text-ink" : "border-line text-muted hover:bg-surface-2"}`}>{t(`indicator.${i}`)}</button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-[12.5px] text-muted"><input type="checkbox" checked={fileNow} onChange={(e) => setFileNow(e.target.checked)} className="accent-primary" /> {t("fileNow")}</label>
          {err ? <p className="text-[12px] font-medium text-danger">{err}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="h-9 rounded-lg border border-line px-3 text-[12.5px] font-medium text-muted hover:bg-surface-2">{t("cancel")}</button>
            <button onClick={save} disabled={saving || subject.trim().length < 3 || description.trim().length < 3 || indicators.length === 0} className="h-9 rounded-lg bg-primary-strong px-4 text-[12.5px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60">{saving ? "…" : t("saveStr")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
