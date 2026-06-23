"use client";

import { useEffect, useState } from "react";
import { FileText, Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { cpapi } from "@/lib/api";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";

interface Doc { id: string; fileName: string; mime: string; sizeBytes: number; docType: string; entityType: string; createdAt: string }

export default function PortalDocuments() {
  const t = useTranslations();
  const [rows, setRows] = useState<Doc[]>([]);
  const [busy, setBusy] = useState("");
  useEffect(() => { void cpapi<Doc[]>("/portal/documents").then(setRows).catch(() => undefined); }, []);

  const kb = (b: number) => `${Math.round(b / 1024)} KB`;
  const date = (d: string) => new Date(d).toLocaleDateString("en-GB");

  async function open(id: string) {
    setBusy(id);
    try {
      const res = await cpapi<{ view: { url: string } }>(`/portal/documents/${id}/url`);
      window.open(res.view.url, "_blank");
    } catch { /* ignore */ }
    finally { setBusy(""); }
  }

  return (
    <PortalShell>
      <PageHeader title={t("portal.documents.title")} subtitle={t("portal.documents.subtitle")} />
      <div className="overflow-x-auto rounded-card border border-line bg-card shadow-card">
        <table className="w-full min-w-[720px]">
          <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
            <th className="px-5 py-3 text-start font-semibold">{t("portal.documents.col.file")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.documents.col.type")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.documents.col.size")}</th>
            <th className="px-5 py-3 text-start font-semibold">{t("portal.documents.col.date")}</th>
            <th className="px-5 py-3"></th>
          </tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((d) => (
              <tr key={d.id} className="hover:bg-surface-2/60">
                <td className="px-5 py-3"><div className="flex items-center gap-2 text-[13px] font-medium text-ink"><FileText size={15} className="text-subtle" /> {d.fileName}</div></td>
                <td className="px-5 py-3"><Badge tone={d.docType === "OFFICIAL" ? "success" : "neutral"}>{t(`portal.documents.${d.docType === "OFFICIAL" ? "official" : "attachment"}`)}</Badge></td>
                <td className="px-5 py-3 text-[12px] text-subtle tnum">{kb(d.sizeBytes)}</td>
                <td className="px-5 py-3 text-[12px] text-subtle tnum">{date(d.createdAt)}</td>
                <td className="px-5 py-3 text-end">
                  <button onClick={() => open(d.id)} disabled={busy === d.id} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 py-1.5 text-[12px] font-medium text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-60">
                    <Download size={14} /> {t("portal.documents.download")}
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={5} className="px-5 py-10 text-center text-[13px] text-subtle">{t("portal.empty")}</td></tr> : null}
          </tbody>
        </table>
      </div>
    </PortalShell>
  );
}
