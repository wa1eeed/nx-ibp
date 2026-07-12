"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderOpen, Search, ExternalLink, FileText, ShieldCheck, Paperclip } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { api, getToken, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { usePaged, Pagination } from "@/components/ui/Pagination";

interface Doc { id: string; fileName: string; mime: string; sizeBytes: number; docType: string; entityType: string; entityId: string; createdAt: string }

// نوع الكيان ⇒ تسمية + مسار التفاصيل (إن وُجد)
const ENTITY: Record<string, { label: string; href?: (id: string) => string }> = {
  client: { label: "عميل", href: (id) => `/tenant/clients/${id}` },
  policy: { label: "وثيقة", href: (id) => `/tenant/policies/${id}` },
  policy_request: { label: "طلب" },
  claim: { label: "مطالبة" },
};

export default function DocumentsPage() {
  const t = useTranslations("documentsCenter");
  const router = useRouter();
  const [rows, setRows] = useState<Doc[]>([]);
  const [docType, setDocType] = useState("");
  const [entityType, setEntityType] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (docType) qs.set("docType", docType);
    if (entityType) qs.set("entityType", entityType);
    if (q.trim()) qs.set("q", q.trim());
    setRows(await api<Doc[]>(`/documents/all${qs.toString() ? `?${qs}` : ""}`));
  }, [docType, entityType, q]);

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    const id = setTimeout(() => void load().catch(() => undefined), 200); // debounce البحث
    return () => clearTimeout(id);
  }, [load, router]);

  const page = usePaged(rows);
  const entityTypes = useMemo(() => [...new Set(rows.map((r) => r.entityType))], [rows]);
  const officialCount = rows.filter((r) => r.docType === "OFFICIAL").length;

  async function open(id: string) {
    setError("");
    try {
      const r = await api<{ view: string }>(`/documents/${id}/url`);
      window.open(r.view, "_blank", "noopener");
    } catch (e) { setError(e instanceof ApiError ? e.message : "خطأ"); }
  }

  const fmtSize = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`);
  const label = (et: string) => ENTITY[et]?.label ?? et;

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {error ? <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}

      {/* ملخّص */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-card border border-line bg-card p-3.5 shadow-card"><div className="mb-1 flex items-center gap-1.5 text-subtle"><FolderOpen size={15} /><span className="text-[11px] font-medium">{t("total")}</span></div><div className="tnum text-[19px] font-bold text-ink">{rows.length}</div></div>
        <div className="rounded-card border border-line bg-card p-3.5 shadow-card"><div className="mb-1 flex items-center gap-1.5 text-success"><ShieldCheck size={15} /><span className="text-[11px] font-medium text-subtle">{t("official")}</span></div><div className="tnum text-[19px] font-bold text-ink">{officialCount}</div></div>
        <div className="rounded-card border border-line bg-card p-3.5 shadow-card"><div className="mb-1 flex items-center gap-1.5 text-subtle"><Paperclip size={15} /><span className="text-[11px] font-medium">{t("attachments")}</span></div><div className="tnum text-[19px] font-bold text-ink">{rows.length - officialCount}</div></div>
      </div>

      {/* فلاتر */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <button onClick={() => setDocType("")} className={chip(docType === "")}>{t("filterAll")}</button>
        <button onClick={() => setDocType("OFFICIAL")} className={chip(docType === "OFFICIAL")}>{t("official")}</button>
        <button onClick={() => setDocType("ATTACHMENT")} className={chip(docType === "ATTACHMENT")}>{t("attachments")}</button>
        {entityTypes.length > 1 ? (
          <select value={entityType} onChange={(e) => setEntityType(e.target.value)} className="h-8 rounded-lg border border-line bg-card px-2 text-[12px] text-ink">
            <option value="">{t("allTypes")}</option>
            {entityTypes.map((et) => <option key={et} value={et}>{label(et)}</option>)}
          </select>
        ) : null}
        <div className="relative ms-auto">
          <Search size={14} className="pointer-events-none absolute inset-y-0 my-auto text-subtle ltr:left-2.5 rtl:right-2.5" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="h-8 w-56 rounded-lg border border-line bg-card text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 ltr:pl-8 rtl:pr-8" />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="grid min-h-[36vh] place-items-center rounded-card border border-dashed border-line bg-card text-center shadow-card text-muted"><div><FolderOpen size={28} className="mx-auto mb-2 text-subtle" /><p className="text-[13px]">{t("empty")}</p></div></div>
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-card shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
                <th className="px-5 py-3 text-start font-semibold">{t("col.file")}</th>
                <th className="px-4 py-3 text-start font-semibold">{t("col.class")}</th>
                <th className="px-4 py-3 text-start font-semibold">{t("col.entity")}</th>
                <th className="px-4 py-3 text-start font-semibold">{t("col.size")}</th>
                <th className="px-4 py-3 text-start font-semibold">{t("col.date")}</th>
                <th className="px-4 py-3"></th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {page.pageItems.map((d) => {
                  const ent = ENTITY[d.entityType];
                  return (
                    <tr key={d.id} className="hover:bg-surface-2/60">
                      <td className="px-5 py-3"><span className="flex items-center gap-2 text-[13px] text-ink"><FileText size={14} className="shrink-0 text-subtle" />{d.fileName}</span></td>
                      <td className="px-4 py-3"><Badge tone={d.docType === "OFFICIAL" ? "success" : "neutral"}>{d.docType === "OFFICIAL" ? t("official") : t("attachments")}</Badge></td>
                      <td className="px-4 py-3 text-[12.5px]">
                        {ent?.href ? <Link href={ent.href(d.entityId)} className="inline-flex items-center gap-1 text-primary hover:underline">{ent.label}<ExternalLink size={11} /></Link> : <span className="text-muted">{label(d.entityType)}</span>}
                      </td>
                      <td className="px-4 py-3 text-[12px] tnum text-muted">{fmtSize(d.sizeBytes)}</td>
                      <td className="px-4 py-3 text-[12px] tnum text-subtle">{new Date(d.createdAt).toLocaleDateString("en-GB")}</td>
                      <td className="px-4 py-3 text-end"><button onClick={() => void open(d.id)} className="inline-flex items-center gap-1 rounded-lg border border-line bg-card px-2.5 py-1.5 text-[12px] font-medium text-primary hover:bg-surface-2">{t("view")}<ExternalLink size={12} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page.page} pageCount={page.pageCount} total={page.total} from={page.from} to={page.to} onPage={page.setPage} />
        </div>
      )}
    </div>
  );
}

const chip = (on: boolean) => ["h-8 rounded-lg border px-3 text-[12px] font-medium", on ? "border-primary bg-primary/10 text-primary" : "border-line text-muted hover:bg-surface-2"].join(" ");
