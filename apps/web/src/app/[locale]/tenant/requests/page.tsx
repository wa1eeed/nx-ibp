"use client";

import { useEffect, useState } from "react";
import { Plus, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { api, getToken } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

interface RequestRow {
  id: string;
  sequenceNo: string | null;
  productLineCode: string;
  status: string;
  createdAt: string;
  client: { id: string; name: string; code: string | null } | null;
}

const STATUS_TONE: Record<string, BadgeTone> = {
  DRAFT: "neutral",
  UNDER_REVIEW: "warning",
  FINANCE_REVIEW: "info",
  APPROVED: "success",
  REJECTED: "danger",
  ISSUED: "success",
};

export default function RequestsPage() {
  const t = useTranslations();
  const router = useRouter();
  const [rows, setRows] = useState<RequestRow[]>([]);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    void api<RequestRow[]>("/requests").then(setRows).catch(() => undefined);
  }, [router]);

  return (
    <div>
      <PageHeader
        title={t("requests.title")}
        subtitle={t("requests.subtitle")}
        actions={
          <Link
            href="/tenant/requests/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-strong px-3.5 py-2 text-[13px] font-semibold text-primary-fg shadow-sm transition-colors hover:bg-primary"
          >
            <Plus size={16} />
            {t("requests.new")}
          </Link>
        }
      />

      {rows.length === 0 ? (
        <div className="grid min-h-[40vh] place-items-center rounded-card border border-dashed border-line bg-card text-center shadow-card">
          <div className="text-muted">
            <FileText size={28} className="mx-auto mb-2 text-subtle" />
            <p className="text-[13px]">{t("requests.empty")}</p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-card shadow-card">
          <table className="w-full">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
                <th className="px-5 py-3 text-start font-semibold">{t("requests.col.seq")}</th>
                <th className="px-5 py-3 text-start font-semibold">{t("requests.col.client")}</th>
                <th className="px-5 py-3 text-start font-semibold">{t("requests.col.product")}</th>
                <th className="px-5 py-3 text-start font-semibold">{t("requests.col.status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-surface-2/60">
                  <td className="px-5 py-3 text-[12.5px] font-medium text-ink tnum">{r.sequenceNo ?? "—"}</td>
                  <td className="px-5 py-3 text-[13px] text-ink">{r.client?.name ?? "—"}</td>
                  <td className="px-5 py-3 text-[13px] text-muted">{r.productLineCode}</td>
                  <td className="px-5 py-3">
                    <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
