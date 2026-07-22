"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { Plus, Award, Trophy, Info, Send, CheckCircle2, XCircle, Clock, FileSignature } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { api, getToken, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { useConfirm } from "@/components/ui/ConfirmProvider";

interface Slip { id: string; sequenceNo: string | null; status: string; insurers: string[]; selectedQuotationId: string | null; presentedAt: string | null; presentedQuotationIds: string[]; clientDecision: string | null; clientDecidedAt: string | null; acceptedQuotationId: string | null; clientDecisionNote: string | null; vatRate: number; request: { id: string; productLineCode: string; client: { id?: string; name: string; type?: string } | null } | null }
interface Column { key: string; labelAr: string; labelEn: string }
interface Row { id: string; insurer: string; status: string; generalRemarks: string | null; [k: string]: string | number | null }
interface Comparison { columns: Column[]; rows: Row[]; bestByPrice: string | null }

const STATUS_TONE: Record<string, BadgeTone> = { DRAFT: "neutral", SENT: "info", QUOTED: "warning", SELECTED: "success", CLOSED: "neutral" };

export default function SlipWorkbenchPage() {
  const t = useTranslations();
  const confirm = useConfirm();
  const locale = useLocale();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const ar = locale === "ar";

  const [slip, setSlip] = useState<Slip | null>(null);
  const [cmp, setCmp] = useState<Comparison | null>(null);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    const [s, c] = await Promise.all([api<Slip>(`/slips/${id}`), api<Comparison>(`/slips/${id}/comparison`)]);
    setSlip(s);
    setCmp(c);
  }, [id]);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    void load().catch(() => undefined);
  }, [load, router]);

  async function firmOrder(quotationId: string, insurer: string) {
    const ok = await confirm({
      title: t("confirm.firmOrder.title"),
      description: t("confirm.firmOrder.desc", { insurer }),
      confirmLabel: t("confirm.firmOrder.action"),
    });
    if (!ok) return;
    setError("");
    try {
      await api(`/slips/${id}/select`, { method: "POST", body: JSON.stringify({ quotationId }) });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "خطأ");
    }
  }

  async function present() {
    if (!cmp || !cmp.rows.length) return;
    const ok = await confirm({
      title: t("underwriting.present.title"),
      description: t("underwriting.present.desc", { count: cmp.rows.length }),
      confirmLabel: t("underwriting.present.action"),
    });
    if (!ok) return;
    setError("");
    try {
      await api(`/slips/${id}/present`, { method: "POST", body: JSON.stringify({ quotationIds: cmp.rows.map((r) => r.id) }) });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "خطأ");
    }
  }

  async function issueCoverNote() {
    if (!slip?.request?.id) return;
    setError("");
    try {
      const cn = await api<{ id: string }>("/cover-notes", { method: "POST", body: JSON.stringify({ requestId: slip.request.id }) });
      router.push(`/tenant/cover-notes/${cn.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "خطأ");
    }
  }

  const fmt = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-US"));
  const decisionTone: Record<string, BadgeTone> = { pending: "warning", accepted: "success", declined: "danger" };
  const hasClient = !!slip?.request?.client;
  const canPresent = slip && slip.status !== "SELECTED" && slip.status !== "CLOSED" && hasClient && (cmp?.rows.length ?? 0) > 0;

  return (
    <div>
      <PageHeader
        title={`${t("underwriting.title")} · ${slip?.sequenceNo ?? ""}`}
        subtitle={slip?.request?.client ? `${slip.request.client.name} — ${slip.request.productLineCode}` : ""}
        actions={
          slip && slip.status !== "SELECTED" ? (
            <div className="flex items-center gap-2">
              {canPresent ? (
                <button onClick={present} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary-soft/40 px-3.5 py-2 text-[13px] font-semibold text-primary hover:bg-primary-soft">
                  <Send size={15} /> {slip.presentedAt ? t("underwriting.present.again") : t("underwriting.present.action")}
                </button>
              ) : null}
              <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-strong px-3.5 py-2 text-[13px] font-semibold text-primary-fg shadow-sm hover:bg-primary">
                <Plus size={16} /> {t("underwriting.addQuotation")}
              </button>
            </div>
          ) : null
        }
      />

      {slip ? (
        <div className="mb-3 flex items-center gap-2 text-[12.5px] text-muted">
          <Badge tone={STATUS_TONE[slip.status] ?? "neutral"}>{t(`underwriting.status.${slip.status.toLowerCase()}`)}</Badge>
          {slip.insurers.length ? <span>{t("underwriting.sentTo")}: {slip.insurers.join("، ")}</span> : null}
        </div>
      ) : null}

      {/* حالة عرض العروض على العميل (§4.1) */}
      {slip?.presentedAt ? (
        <div className={`mb-3 flex flex-wrap items-center gap-2 rounded-lg border px-3.5 py-2.5 text-[12.5px] ${slip.clientDecision === "accepted" ? "border-success/30 bg-success-soft/40" : slip.clientDecision === "declined" ? "border-danger/30 bg-danger-soft/40" : "border-warning/30 bg-warning-soft/40"}`}>
          {slip.clientDecision === "accepted" ? <CheckCircle2 size={15} className="text-success" /> : slip.clientDecision === "declined" ? <XCircle size={15} className="text-danger" /> : <Clock size={15} className="text-warning" />}
          <span className="font-semibold text-ink">{t("underwriting.present.presented", { count: slip.presentedQuotationIds.length })}</span>
          <Badge tone={decisionTone[slip.clientDecision ?? "pending"] ?? "neutral"}>{t(`underwriting.present.decision.${slip.clientDecision ?? "pending"}`)}</Badge>
          {slip.clientDecisionNote ? <span className="text-muted">— {slip.clientDecisionNote}</span> : null}
        </div>
      ) : null}

      {/* أمر إسناد قائم ⇒ إتاحة إصدار مذكرة تغطية مؤقتة (§4.2) */}
      {slip?.status === "SELECTED" ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface-2/40 px-3.5 py-2.5">
          <span className="text-[12.5px] text-muted">{t("underwriting.coverNote.hint")}</span>
          <button onClick={issueCoverNote} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary-soft/40 px-3.5 py-2 text-[13px] font-semibold text-primary hover:bg-primary-soft">
            <FileSignature size={15} /> {t("underwriting.coverNote.issue")}
          </button>
        </div>
      ) : null}

      {error ? <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}

      {showForm ? <AddQuotation slipId={id} vatRate={slip?.vatRate ?? 15} onDone={() => { setShowForm(false); void load(); }} onError={setError} /> : null}

      {/* جدول المقارنة الآلي */}
      <div className="overflow-hidden rounded-card border border-line bg-card shadow-card">
        <div className="border-b border-line px-5 py-3 text-[14px] font-semibold text-ink">{t("underwriting.comparison")}</div>
        {cmp && cmp.rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
                  <th className="px-5 py-3 text-start font-semibold">{t("underwriting.insurer")}</th>
                  {cmp.columns.map((c) => (
                    <th key={c.key} className="px-4 py-3 text-start font-semibold">{ar ? c.labelAr : c.labelEn}</th>
                  ))}
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {cmp.rows.map((r) => {
                  const best = cmp.bestByPrice === r.id;
                  const selected = slip?.selectedQuotationId === r.id;
                  return (
                    <tr key={r.id} className={selected ? "bg-success-soft/50" : best ? "bg-primary-soft/40" : "hover:bg-surface-2/60"}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2 text-[13px] font-medium text-ink">
                          {r.insurer}
                          {best ? <Trophy size={13} className="text-primary" /> : null}
                        </div>
                        {r.generalRemarks ? <div className="text-[11px] text-subtle">{r.generalRemarks}</div> : null}
                      </td>
                      {cmp.columns.map((c) => {
                        const val = r[c.key];
                        const isRate = c.key === "rate";
                        const num = typeof val === "number" ? val : null;
                        return (
                          <td key={c.key} className={`px-4 py-3 text-[12.5px] tnum ${c.key === "totalPremium" ? "font-semibold text-ink" : c.key === "commissionAmount" ? "text-success" : ""}`}>
                            {isRate ? (num == null ? "—" : `${num}%`) : fmt(num)}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-end">
                        {selected ? (
                          <Badge tone="success">{t("underwriting.selected")}</Badge>
                        ) : slip?.status !== "SELECTED" ? (
                          <button onClick={() => firmOrder(r.id, r.insurer)} className="inline-flex items-center gap-1 rounded-lg border border-line bg-card px-2.5 py-1.5 text-[12px] font-medium text-primary hover:bg-surface-2">
                            <Award size={13} /> {t("underwriting.firmOrder")}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-[13px] text-muted">{t("underwriting.noQuotations")}</div>
        )}
      </div>
    </div>
  );
}

function AddQuotation({ slipId, vatRate, onDone, onError }: { slipId: string; vatRate: number; onDone: () => void; onError: (s: string) => void }) {
  const t = useTranslations();
  const [v, setV] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  // خيارات المؤمِّنين (اسم + نسبة العمولة) لتعبئة النسبة تلقائيًا من سجلّ الشركات
  const [insurers, setInsurers] = useState<Array<{ id: string; name: string; nameEn: string | null; commissionRate: number | null }>>([]);
  const [rateAuto, setRateAuto] = useState(false);
  const appliedRef = useRef("");
  useEffect(() => { void api<typeof insurers>("/insurers/options").then(setInsurers).catch(() => setInsurers([])); }, []);
  // تعديل النسبة يدويًا يُلغي وسم «تلقائي»
  const set = (k: string) => (e: { target: { value: string } }) => { if (k === "commissionRate") setRateAuto(false); setV((p) => ({ ...p, [k]: e.target.value })); };
  const numField = (k: string) => (v[k] === undefined || v[k] === "" ? undefined : Number(v[k]));

  const norm = (s: string) => s.trim().toLowerCase();
  const matchedInsurer = insurers.find((i) => norm(i.name) === norm(v.insurerName ?? "") || (i.nameEn ? norm(i.nameEn) === norm(v.insurerName ?? "") : false));
  // عند اختيار/كتابة مؤمِّن مُسجّل: عبّئ نسبة العمولة من سجلّ الشركة (يبقى قابلًا للتعديل)
  function onInsurerChange(e: { target: { value: string } }) {
    const name = e.target.value;
    const match = insurers.find((i) => norm(i.name) === norm(name) || (i.nameEn ? norm(i.nameEn) === norm(name) : false));
    const apply = !!(match && match.commissionRate != null && appliedRef.current !== match.name);
    if (apply && match) appliedRef.current = match.name;
    setV((p) => ({ ...p, insurerName: name, ...(apply && match ? { commissionRate: String(match.commissionRate) } : {}) }));
    if (apply) setRateAuto(true);
  }

  // المشتقّات محسوبة حيًّا من المدخلات (لا زر احتساب ولا إدخال يدوي للضريبة):
  //  القسط الصافي (=مبلغ التأمين×النسبة أو المُدخَل مباشرةً) · الضريبة (نسبة الفرع: حياة 0% / غيره 15%)
  //  · الإجمالي (=صافي+رسوم+ضريبة) · عمولة الوسيط (=صافي×نسبة العمولة) · ضريبة العمولة (15% دائمًا).
  const si = numField("sumInsured"), rate = numField("rate"), fees = numField("policyFees") ?? 0, comRate = numField("commissionRate");
  const premium = numField("premium") ?? (si != null && rate != null ? +((si * rate) / 100).toFixed(2) : undefined);
  const vat = premium != null ? +((premium * vatRate) / 100).toFixed(2) : undefined;
  const total = premium != null ? +(premium + fees + (vat ?? 0)).toFixed(2) : undefined;
  const commission = premium != null && comRate != null ? +((premium * comRate) / 100).toFixed(2) : undefined;
  const commissionVat = commission != null ? +((commission * 15) / 100).toFixed(2) : undefined; // العمولة رسم خدمة الوسيط ⇒ 15% دائمًا

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/slips/${slipId}/quotations`, {
        method: "POST",
        body: JSON.stringify({
          insurerName: v.insurerName ?? "",
          sumInsured: numField("sumInsured"),
          rate: numField("rate"),
          premium,
          policyFees: numField("policyFees"),
          vat,
          totalPremium: total,
          commissionRate: numField("commissionRate"),
          commissionAmount: commission,
          commissionVat,
          deductible: numField("deductible"),
          limit: numField("limit"),
          generalRemarks: v.generalRemarks || undefined,
        }),
      });
      onDone();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "خطأ");
    } finally {
      setSaving(false);
    }
  }

  // حقل مُدخَل مع أيقونة تلميح (tooltip) بجانب العنوان + نص تعريفي صغير تحته.
  const F = (k: string, label: string, opts: { type?: string; hint?: string; sub?: string } = {}) => (
    <label className="block">
      <span className="mb-1 flex items-center gap-1 text-[12px] font-medium text-muted">
        {label}
        {opts.hint ? (
          <span title={opts.hint} className="inline-flex cursor-help text-subtle hover:text-primary" aria-label={opts.hint}>
            <Info size={12.5} />
          </span>
        ) : null}
      </span>
      <input type={opts.type ?? "number"} value={v[k] ?? ""} onChange={set(k)} className="h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px]" />
      {opts.sub ? <span className="mt-1 block text-[10.5px] leading-tight text-subtle">{opts.sub}</span> : null}
    </label>
  );

  const fmt = (n: number | undefined) => (n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  // بند في الملخّص المحسوب (قيمة للقراءة فقط، تتحدّث تلقائيًا).
  const S = (label: string, value: number | undefined, opts: { strong?: boolean; tone?: string; note?: string } = {}) => (
    <div className="flex flex-col rounded-lg border border-line bg-card px-3 py-2">
      <span className="text-[10.5px] font-medium text-subtle">{label}</span>
      <span className={["tnum leading-tight", opts.strong ? "text-[15px] font-bold text-ink" : "text-[13.5px] font-semibold", opts.tone ?? "text-ink"].join(" ")}>{fmt(value)}</span>
      {opts.note ? <span className="text-[10px] text-subtle">{opts.note}</span> : null}
    </div>
  );

  return (
    <form onSubmit={submit} className="mb-4 rounded-card border border-line bg-card p-5 shadow-card">
      <div className="mb-3 text-[14px] font-semibold text-ink">{t("underwriting.addQuotation")}</div>
      {/* المدخلات فقط — الوسيط يُدخل ما تُرسله شركة التأمين */}
      <div className="grid grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-4">
        {/* اسم المؤمِّن — منتقٍ من سجلّ الشركات (يبقى الكتابة الحرّة ممكنة) */}
        <label className="block">
          <span className="mb-1 flex items-center gap-1 text-[12px] font-medium text-muted">
            {t("underwriting.insurer")}
            <span title={t("underwriting.hint.insurer")} className="inline-flex cursor-help text-subtle hover:text-primary" aria-label={t("underwriting.hint.insurer")}><Info size={12.5} /></span>
          </span>
          <input list="insurer-options" type="text" value={v.insurerName ?? ""} onChange={onInsurerChange} className="h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px]" />
          <datalist id="insurer-options">{insurers.map((i) => <option key={i.id} value={i.name} />)}</datalist>
          <span className={`mt-1 block text-[10.5px] leading-tight ${matchedInsurer ? "text-success" : "text-subtle"}`}>{matchedInsurer ? `✓ ${t("underwriting.insurerRegistered")}` : t("underwriting.insurerPickHint")}</span>
        </label>
        {F("sumInsured", t("underwriting.sumInsured"), { hint: t("underwriting.hint.sumInsured"), sub: t("underwriting.sub.sumInsured") })}
        {F("rate", t("underwriting.rate"), { hint: t("underwriting.hint.rate"), sub: t("underwriting.sub.rate") })}
        {F("premium", t("underwriting.premium"), { hint: t("underwriting.hint.premium"), sub: t("underwriting.sub.premium") })}
        {F("policyFees", t("underwriting.policyFees"), { hint: t("underwriting.hint.policyFees"), sub: t("underwriting.sub.policyFees") })}
        {/* نسبة العمولة — تُعبَّأ تلقائيًا من سجلّ المؤمِّن، وتبقى قابلة للتعديل */}
        <label className="block">
          <span className="mb-1 flex items-center gap-1 text-[12px] font-medium text-muted">
            {t("underwriting.commissionRate")}
            <span title={t("underwriting.hint.commissionRate")} className="inline-flex cursor-help text-subtle hover:text-primary" aria-label={t("underwriting.hint.commissionRate")}><Info size={12.5} /></span>
            {rateAuto ? <span className="ms-auto rounded-full bg-success-soft px-1.5 py-0.5 text-[9.5px] font-semibold text-success">{t("underwriting.rateFromRegistry")}</span> : null}
          </span>
          <input type="number" value={v.commissionRate ?? ""} onChange={set("commissionRate")} className="h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px]" />
          <span className="mt-1 block text-[10.5px] leading-tight text-subtle">{t("underwriting.sub.commissionRate")}</span>
        </label>
        {F("deductible", t("underwriting.deductible"), { hint: t("underwriting.hint.deductible"), sub: t("underwriting.sub.deductible") })}
        {F("limit", t("underwriting.limit"), { hint: t("underwriting.hint.limit"), sub: t("underwriting.sub.limit") })}
      </div>

      {/* الملخّص المحسوب تلقائيًا — الضريبة والإجماليات والعمولة (قراءة فقط) */}
      <div className="mt-4 rounded-card border border-primary/20 bg-primary/5 p-3.5">
        <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-primary">
          <Info size={13} /> {t("underwriting.computedSummary")}
          <span className="ms-auto font-normal text-subtle">{t("underwriting.autoNote")}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {S(t("underwriting.netPremium"), premium)}
          {S(vatRate === 0 ? t("underwriting.vat") : t("underwriting.vatLabel", { rate: vatRate }), vat, { note: vatRate === 0 ? t("underwriting.vatExempt") : undefined })}
          {S(t("underwriting.totalPremium"), total, { strong: true })}
          {S(t("underwriting.commissionAmount"), commission, { tone: "text-success" })}
          {S(t("underwriting.commissionVat"), commissionVat)}
        </div>
      </div>

      <label className="mt-4 block">
        <span className="mb-1 flex items-center gap-1 text-[12px] font-medium text-muted">
          {t("underwriting.remarks")}
          <span title={t("underwriting.hint.remarks")} className="inline-flex cursor-help text-subtle hover:text-primary" aria-label={t("underwriting.hint.remarks")}><Info size={12.5} /></span>
        </span>
        <textarea value={v.generalRemarks ?? ""} onChange={set("generalRemarks")} className="h-16 w-full rounded-lg border border-line bg-card px-3 py-2 text-[13px]" />
      </label>
      <div className="mt-3 flex justify-end">
        <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-strong px-4 py-2 text-[13px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60">
          {saving ? "…" : t("underwriting.add")}
        </button>
      </div>
    </form>
  );
}
