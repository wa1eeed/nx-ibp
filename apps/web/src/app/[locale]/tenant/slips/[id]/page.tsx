"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { Plus, Award, Trophy, Info } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { api, getToken, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { useConfirm } from "@/components/ui/ConfirmProvider";

interface Slip { id: string; sequenceNo: string | null; status: string; insurers: string[]; selectedQuotationId: string | null; request: { id: string; productLineCode: string; client: { name: string } | null } | null }
interface Column { key: string; labelAr: string; labelEn: string }
interface Row { id: string; insurer: string; status: string; rate: number | null; premium: number | null; vat: number | null; totalPremium: number | null; deductible: number | null; limit: number | null; generalRemarks: string | null }
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

  const fmt = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-US"));

  return (
    <div>
      <PageHeader
        title={`${t("underwriting.title")} · ${slip?.sequenceNo ?? ""}`}
        subtitle={slip?.request?.client ? `${slip.request.client.name} — ${slip.request.productLineCode}` : ""}
        actions={
          slip && slip.status !== "SELECTED" ? (
            <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-strong px-3.5 py-2 text-[13px] font-semibold text-primary-fg shadow-sm hover:bg-primary">
              <Plus size={16} /> {t("underwriting.addQuotation")}
            </button>
          ) : null
        }
      />

      {slip ? (
        <div className="mb-3 flex items-center gap-2 text-[12.5px] text-muted">
          <Badge tone={STATUS_TONE[slip.status] ?? "neutral"}>{slip.status}</Badge>
          {slip.insurers.length ? <span>{t("underwriting.sentTo")}: {slip.insurers.join("، ")}</span> : null}
        </div>
      ) : null}

      {error ? <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}

      {showForm ? <AddQuotation slipId={id} onDone={() => { setShowForm(false); void load(); }} onError={setError} /> : null}

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
                      <td className="px-4 py-3 text-[12.5px] tnum">{r.rate == null ? "—" : `${r.rate}%`}</td>
                      <td className="px-4 py-3 text-[12.5px] tnum">{fmt(r.premium)}</td>
                      <td className="px-4 py-3 text-[12.5px] tnum">{fmt(r.vat)}</td>
                      <td className="px-4 py-3 text-[12.5px] font-semibold tnum">{fmt(r.totalPremium)}</td>
                      <td className="px-4 py-3 text-[12.5px] tnum">{fmt(r.deductible)}</td>
                      <td className="px-4 py-3 text-[12.5px] tnum">{fmt(r.limit)}</td>
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

function AddQuotation({ slipId, onDone, onError }: { slipId: string; onDone: () => void; onError: (s: string) => void }) {
  const t = useTranslations();
  const [v, setV] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (k: string) => (e: { target: { value: string } }) => setV((p) => ({ ...p, [k]: e.target.value }));
  const numField = (k: string) => (v[k] === undefined || v[k] === "" ? undefined : Number(v[k]));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/slips/${slipId}/quotations`, {
        method: "POST",
        body: JSON.stringify({
          insurerName: v.insurerName ?? "",
          rate: numField("rate"),
          premium: numField("premium"),
          vat: numField("vat"),
          totalPremium: numField("totalPremium"),
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

  // حقل مع أيقونة تلميح (tooltip) بجانب العنوان + نص تعريفي صغير تحته.
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

  return (
    <form onSubmit={submit} className="mb-4 rounded-card border border-line bg-card p-5 shadow-card">
      <div className="mb-3 text-[14px] font-semibold text-ink">{t("underwriting.addQuotation")}</div>
      <div className="grid grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-4">
        {F("insurerName", t("underwriting.insurer"), { type: "text", hint: t("underwriting.hint.insurer") })}
        {F("rate", t("underwriting.rate"), { hint: t("underwriting.hint.rate"), sub: t("underwriting.sub.rate") })}
        {F("premium", t("underwriting.premium"), { hint: t("underwriting.hint.premium"), sub: t("underwriting.sub.premium") })}
        {F("vat", t("underwriting.vat"), { hint: t("underwriting.hint.vat"), sub: t("underwriting.sub.vat") })}
        {F("totalPremium", t("underwriting.totalPremium"), { hint: t("underwriting.hint.totalPremium"), sub: t("underwriting.sub.totalPremium") })}
        {F("deductible", t("underwriting.deductible"), { hint: t("underwriting.hint.deductible"), sub: t("underwriting.sub.deductible") })}
        {F("limit", t("underwriting.limit"), { hint: t("underwriting.hint.limit"), sub: t("underwriting.sub.limit") })}
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
