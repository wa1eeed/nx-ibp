"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { FileText, ArrowRight, FileSpreadsheet, Pencil, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { SectionDef, BlockDef, FieldDef, FieldOption } from "@ibp/shared";
import { Link, useRouter } from "@/i18n/routing";
import { api, getToken, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { usePermissions } from "@/hooks/usePermissions";
import { DynamicForm, type FormPayload } from "@/components/forms/DynamicForm";

interface ReqDetail {
  id: string; sequenceNo: string | null; productLineCode: string; status: string; createdAt: string;
  base: Record<string, unknown>;
  client: { id: string; name: string; code: string | null } | null;
  blockRows: Array<{ blockKey: string; rowIndex: number; data: Record<string, unknown> }>;
}
interface LineSchema { code: string; name: string; formSchema: { baseFields: SectionDef[]; blocks: BlockDef[] } }

const STATUS_TONE: Record<string, BadgeTone> = {
  DRAFT: "neutral", RFQ: "warning", UNDER_REVIEW: "warning", QUOTED: "info", PROPOSAL: "info",
  FINANCE_REVIEW: "info", AWARDED: "success", ISSUED: "success", REJECTED: "danger", CANCELLED: "neutral",
};

export default function RequestDetailPage() {
  const t = useTranslations("requests");
  const locale = useLocale();
  const ar = locale === "ar";
  const params = useParams();
  const router = useRouter();
  const confirm = useConfirm();
  const { can } = usePermissions();
  const canEdit = can("sales", "edit");
  const canRfq = can("underwriting", "create");
  const id = String(params.id);

  const [req, setReq] = useState<ReqDetail | null>(null);
  const [schema, setSchema] = useState<{ baseFields: SectionDef[]; blocks: BlockDef[] } | null>(null);
  const [lineName, setLineName] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<ReqDetail>(`/requests/${id}`);
      setReq(r);
      const line = await api<LineSchema>(`/catalog/lines/${r.productLineCode}`).catch(() => null);
      if (line) { setSchema(line.formSchema); setLineName(line.name); }
    } catch (e) { setError(e instanceof ApiError ? e.message : "خطأ"); }
  }, [id]);
  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    void load();
  }, [load, router]);

  const lbl = (f: { labelAr: string; labelEn: string }) => (ar ? f.labelAr : f.labelEn);
  const title = (s: { titleAr: string; titleEn: string }) => (ar ? s.titleAr : s.titleEn);
  const optLabel = (opts: FieldOption[] | undefined, v: unknown) => opts?.find((o) => o.value === v)?.[ar ? "labelAr" : "labelEn"] ?? String(v ?? "—");
  const show = (f: FieldDef, v: unknown) => {
    if (v == null || v === "") return "—";
    if (f.type === "select") return optLabel(f.options, v);
    if (typeof v === "number") return v.toLocaleString("en-US");
    return String(v);
  };

  // إعادة بناء صفوف الكتل مجمّعة بالمفتاح (للعرض والتعديل)
  const blocksByKey = useMemo(() => {
    const map: Record<string, Array<Record<string, unknown>>> = {};
    for (const r of req?.blockRows ?? []) (map[r.blockKey] ??= []).push(r.data);
    return map;
  }, [req]);

  async function saveEdit(payload: FormPayload) {
    setSaving(true); setError(""); setNotice("");
    try {
      await api(`/requests/${id}`, { method: "PATCH", body: JSON.stringify({ base: payload.base, blocks: payload.blocks }) });
      setEditing(false); setNotice(t("detail.saved")); await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : "خطأ"); }
    finally { setSaving(false); }
  }

  async function startRfq() {
    const ok = await confirm({ title: t("confirm.startRfq.title"), description: t("confirm.startRfq.desc"), confirmLabel: t("confirm.startRfq.action") });
    if (!ok) return;
    setError("");
    try { const slip = await api<{ id: string }>("/slips", { method: "POST", body: JSON.stringify({ requestId: id }) }); router.push(`/tenant/slips/${slip.id}`); }
    catch (e) { setError(e instanceof ApiError ? e.message : "خطأ"); }
  }

  if (!req) return <div className="grid min-h-[40vh] place-items-center text-subtle">{error || "…"}</div>;
  const isDraft = req.status === "DRAFT";

  return (
    <div>
      <PageHeader
        title={`${t("detail.title")} · ${req.sequenceNo ?? "—"}`}
        subtitle={schema ? undefined : req.productLineCode}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/tenant/requests" className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[12.5px] font-medium text-muted hover:bg-surface-2"><ArrowRight size={14} /> {t("detail.back")}</Link>
            {isDraft && canEdit && !editing ? (
              <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[12.5px] font-medium text-primary hover:bg-surface-2"><Pencil size={14} /> {t("detail.edit")}</button>
            ) : null}
            {editing ? (
              <button onClick={() => setEditing(false)} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[12.5px] font-medium text-muted hover:bg-surface-2"><X size={14} /> {t("detail.cancelEdit")}</button>
            ) : null}
            {isDraft && canRfq && !editing ? (
              <button onClick={startRfq} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-strong px-3.5 py-2 text-[13px] font-semibold text-primary-fg hover:bg-primary"><FileSpreadsheet size={15} /> {t("rfq")}</button>
            ) : null}
          </div>
        }
      />

      {error ? <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}
      {notice ? <p className="mb-3 rounded-lg bg-success-soft px-3 py-2 text-[12.5px] font-medium text-success">{notice}</p> : null}

      {/* ملخّص الطلب */}
      <div className="mb-4 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-card border border-line bg-card p-4 shadow-card text-[13px]">
        <div><div className="text-[11.5px] text-subtle">{t("detail.status")}</div><Badge tone={STATUS_TONE[req.status] ?? "neutral"}>{req.status}</Badge></div>
        <div><div className="text-[11.5px] text-subtle">{t("detail.client")}</div><div className="mt-0.5 font-semibold text-ink">{req.client ? <Link href={`/tenant/clients/${req.client.id}`} className="hover:text-primary hover:underline">{req.client.name}</Link> : "—"}</div></div>
        <div><div className="text-[11.5px] text-subtle">{t("detail.line")}</div><div className="mt-0.5 font-semibold text-ink">{lineName ?? req.productLineCode}</div></div>
        <div><div className="text-[11.5px] text-subtle">{t("detail.created")}</div><div className="mt-0.5 font-semibold text-ink tnum">{new Date(req.createdAt).toLocaleDateString("en-GB")}</div></div>
      </div>

      {/* التعديل (مسودّة فقط) */}
      {editing && schema ? (
        <DynamicForm
          key={`edit-${req.id}`}
          schema={{ sections: schema.baseFields, blocks: schema.blocks }}
          initialBase={req.base}
          initialBlocks={blocksByKey}
          submitting={saving}
          error={error}
          onSubmit={saveEdit}
        />
      ) : schema ? (
        <div className="space-y-4">
          {/* الحقول الأساسية */}
          {schema.baseFields.map((sec) => (
            <section key={sec.key} className="rounded-card border border-line bg-card p-4 shadow-card">
              <h2 className="mb-3 text-[13px] font-bold text-ink">{title(sec)}</h2>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
                {sec.fields.map((f) => (
                  <div key={f.key}><div className="text-[11.5px] text-subtle">{lbl(f)}</div><div className="mt-0.5 text-[13px] font-medium text-ink">{show(f, (req.base as Record<string, unknown>)[f.key])}</div></div>
                ))}
              </div>
            </section>
          ))}
          {/* الكتل المتكرّرة */}
          {schema.blocks.map((b) => {
            const rows = blocksByKey[b.key] ?? [];
            if (!rows.length) return null;
            return (
              <section key={b.key} className="overflow-hidden rounded-card border border-line bg-card shadow-card">
                <div className="border-b border-line px-4 py-2.5 text-[13px] font-bold text-ink">{title(b)} <span className="text-[11.5px] font-normal text-subtle">({rows.length})</span></div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[12.5px]">
                    <thead><tr className="border-b border-line bg-surface-2 text-subtle">{b.fields.map((c) => <th key={c.key} className="px-3 py-2 text-start font-semibold">{lbl(c)}</th>)}</tr></thead>
                    <tbody className="divide-y divide-line">
                      {rows.map((row, i) => (
                        <tr key={i} className="hover:bg-surface-2/40">{b.fields.map((c) => <td key={c.key} className="px-3 py-1.5 text-ink">{show(c, row[c.key])}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="rounded-card border border-dashed border-line bg-card p-8 text-center text-[13px] text-muted shadow-card"><FileText size={26} className="mx-auto mb-2 text-subtle" /> {req.productLineCode}</div>
      )}
    </div>
  );
}
