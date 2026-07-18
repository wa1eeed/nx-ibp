"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Save, Check, ListChecks, ChevronLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { RBAC_MODULES } from "@ibp/shared";
import { api } from "@/lib/api";

interface Step { key: string; name: string; module: string; action: string }
const ACTIONS = ["read", "create", "update", "delete"] as const;

/** تهيئة سلسلة اعتماد الوثيقة (E2) — خطوات إضافية بين الفني والمالي، لكل خطوة وحدتها المخوّلة. */
export default function ApprovalChainPage() {
  const t = useTranslations("approvalChain");
  const [steps, setSteps] = useState<Step[]>([]);
  const [technicalGate, setTechnicalGate] = useState(true);
  const [segregation, setSegregation] = useState(true);
  const [technicalSeg, setTechnicalSeg] = useState(false); // §9.2 — اختياري (افتراضي مُعطَّل)
  const [freeLookDays, setFreeLookDays] = useState(0); // §6.4 — حق العدول (0 = مُعطَّل)
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api<{ steps: Step[]; technicalGate?: boolean; segregationOfDuties?: boolean; technicalSegregation?: boolean }>("/config/approval-chain");
      setSteps(r.steps.map((s) => ({ ...s, action: s.action ?? "update" })));
      setTechnicalGate(r.technicalGate !== false);
      setSegregation(r.segregationOfDuties !== false);
      setTechnicalSeg(r.technicalSegregation === true);
      const op = await api<{ freeLookDays: number }>("/config/operations");
      setFreeLookDays(op.freeLookDays);
    } catch { setError(t("error")); }
  }, [t]);
  useEffect(() => { void load(); }, [load]);

  const patch = (i: number, p: Partial<Step>) => { setSaved(false); setSteps((s) => s.map((x, idx) => (idx === i ? { ...x, ...p } : x))); };
  const add = () => { setSaved(false); setSteps((s) => [...s, { key: `step-${Date.now()}${s.length}`, name: "", module: "compliance", action: "update" }]); };
  const remove = (i: number) => { setSaved(false); setSteps((s) => s.filter((_, idx) => idx !== i)); };

  async function save() {
    setError(""); setSaved(false);
    try {
      const payload = steps.map((s) => ({ key: s.key, name: s.name.trim() || t("namePlaceholder"), module: s.module, action: s.action }));
      await api("/config/approval-chain", { method: "PUT", body: JSON.stringify({ steps: payload, technicalGate, segregationOfDuties: segregation, technicalSegregation: technicalSeg }) });
      await api("/config/operations", { method: "PUT", body: JSON.stringify({ freeLookDays: Math.max(0, Math.min(90, Math.floor(freeLookDays) || 0)) }) });
      setSaved(true);
      await load();
    } catch (e) { setError((e as Error).message || t("error")); }
  }

  const chip = (label: string, tone = "bg-surface-2 text-subtle") => (
    <span className={["whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold", tone].join(" ")}>{label}</span>
  );

  const toggleRow = (label: string, hint: string, on: boolean, onToggle: () => void, tag?: string) => (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-ink">{label}</span>
          {tag ? <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10.5px] font-medium text-warning">{tag}</span> : null}
        </div>
        <p className="text-[11.5px] text-subtle">{hint}</p>
      </div>
      <button type="button" role="switch" aria-checked={on} onClick={onToggle}
        className={["relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-surface-2"].join(" ")}>
        <span className={["absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "ltr:left-[22px] rtl:right-[22px]" : "ltr:left-0.5 rtl:right-0.5"].join(" ")} />
      </button>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><ListChecks size={20} /></div>
        <div><h1 className="text-lg font-bold text-ink">{t("title")}</h1><p className="text-[12.5px] text-subtle">{t("subtitle")}</p></div>
      </header>

      {/* تصوّر مسار الاعتماد */}
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-card p-3">
        {chip(t("flowTechnical"), "bg-primary/10 text-primary")}
        {steps.map((s) => (
          <span key={s.key} className="flex items-center gap-2">
            <ChevronLeft size={14} className="text-subtle rtl:rotate-180" />
            {chip(s.name.trim() || t("namePlaceholder"), "bg-warning/10 text-warning")}
          </span>
        ))}
        <ChevronLeft size={14} className="text-subtle rtl:rotate-180" />
        {chip(t("flowFinance"), "bg-success/10 text-success")}
      </div>

      {/* سياسات الاعتماد */}
      <div className="rounded-card border border-line bg-card p-3">
        <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-subtle">{t("policies")}</p>
        {toggleRow(t("technicalGate"), t("technicalGateHint"), technicalGate, () => { setSaved(false); setTechnicalGate((v) => !v); })}
        <div className="my-2.5 border-t border-line" />
        {toggleRow(t("segregation"), t("segregationHint"), segregation, () => { setSaved(false); setSegregation((v) => !v); }, t("complianceTag"))}
        <div className="my-2.5 border-t border-line" />
        {toggleRow(t("technicalSeg"), t("technicalSegHint"), technicalSeg, () => { setSaved(false); setTechnicalSeg((v) => !v); }, t("optionalTag"))}
        <div className="my-2.5 border-t border-line" />
        {/* §6.4 — مدّة حق العدول (Free-look) */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-ink">{t("freeLook")}</span>
              <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10.5px] font-medium text-warning">{t("complianceTag")}</span>
            </div>
            <p className="text-[11.5px] text-subtle">{t("freeLookHint")}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <input type="number" min={0} max={90} value={freeLookDays}
              onChange={(e) => { setSaved(false); setFreeLookDays(Number(e.target.value)); }}
              className="h-9 w-20 rounded-lg border border-line bg-card px-2 text-center text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30" />
            <span className="text-[12px] text-subtle">{t("days")}</span>
          </div>
        </div>
      </div>

      {error ? <p className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}
      {steps.length === 0 ? <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-[12.5px] text-subtle">{t("defaultNote")}</p> : null}

      <div className="space-y-2.5">
        {steps.map((s, i) => (
          <section key={s.key} className="grid grid-cols-1 gap-2.5 rounded-card border border-line bg-card p-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-subtle">{t("stepName")}</span>
              <input value={s.name} onChange={(e) => patch(i, { name: e.target.value })} placeholder={t("namePlaceholder")}
                className="h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-subtle">{t("module")}</span>
              <select value={s.module} onChange={(e) => patch(i, { module: e.target.value })}
                className="h-9 w-full rounded-lg border border-line bg-card px-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30">
                {RBAC_MODULES.map((m) => <option key={m} value={m}>{t(`modules.${m}`)}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-subtle">{t("action")}</span>
              <select value={s.action} onChange={(e) => patch(i, { action: e.target.value })}
                className="h-9 w-full rounded-lg border border-line bg-card px-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30">
                {ACTIONS.map((a) => <option key={a} value={a}>{t(`actions.${a}`)}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => remove(i)} aria-label={t("remove")}
              className="grid h-9 w-9 place-items-center rounded-lg border border-line text-muted transition-colors hover:bg-danger/10 hover:text-danger">
              <Trash2 size={15} />
            </button>
          </section>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button type="button" onClick={add} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[12.5px] font-semibold text-ink hover:bg-surface-2">
          <Plus size={15} /> {t("add")}
        </button>
        <button type="button" onClick={() => void save()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-4 text-[12.5px] font-semibold text-white hover:opacity-90">
          {saved ? <Check size={15} /> : <Save size={15} />} {saved ? t("saved") : t("save")}
        </button>
      </div>
    </div>
  );
}
