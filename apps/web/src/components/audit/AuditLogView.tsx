"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollText, Lock, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/ui/PageHeader";

export interface AuditRow {
  id: string; tenantId: string; actor: string; action: string; entity: string;
  entityId: string | null; ipAddress: string | null; userAgent: string | null; meta: unknown; createdAt: string;
}

const ACTION_TONE: Record<string, string> = {
  create: "bg-success-soft text-success", approve: "bg-success-soft text-success",
  update: "bg-info-soft text-info", login: "bg-surface-2 text-muted", verify: "bg-info-soft text-info",
  delete: "bg-danger/10 text-danger", erase: "bg-danger/10 text-danger", revert: "bg-warning-soft text-warning",
  file_url: "bg-surface-2 text-muted",
};

/** عرض سجل التدقيق (مشترك بين المستأجر والسوبر أدمن) — بأسماء المنفّذين وفلترة وملاحظة الثبات. */
export function AuditLogView({ fetcher, endpoint, showTenant = false, admin = false }: {
  fetcher: <T>(path: string) => Promise<T>;
  endpoint: string;
  showTenant?: boolean;
  admin?: boolean;
}) {
  const t = useTranslations("audit");
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");

  const load = useCallback(async () => {
    const qs = [action ? `action=${action}` : "", entity ? `entity=${entity}` : ""].filter(Boolean).join("&");
    setRows(await fetcher<AuditRow[]>(`${endpoint}${qs ? `?${qs}` : ""}`));
  }, [fetcher, endpoint, action, entity]);
  useEffect(() => { void load().catch(() => undefined); }, [load]);

  // خيارات الفلترة مشتقّة من البيانات المحمّلة (أفعال/عناصر ظاهرة فعلًا)
  const [allActions, setAllActions] = useState<string[]>([]);
  const [allEntities, setAllEntities] = useState<string[]>([]);
  useEffect(() => {
    if (!action && !entity && rows.length) {
      setAllActions((prev) => [...new Set([...prev, ...rows.map((r) => r.action)])].sort());
      setAllEntities((prev) => [...new Set([...prev, ...rows.map((r) => r.entity)])].sort());
    }
  }, [rows, action, entity]);

  const lbl = (ns: "action" | "entity", key: string) => (t.has(`${ns}.${key}`) ? t(`${ns}.${key}`) : key);
  const time = (d: string) => new Date(d).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
  const device = (ua: string | null) => (!ua ? "—" : /iPhone|Android|Mobile/i.test(ua) ? "Mobile" : /Mac/i.test(ua) ? "Mac" : /Windows/i.test(ua) ? "Windows" : /Linux/i.test(ua) ? "Linux" : ua.slice(0, 18));
  const sel = "h-9 rounded-lg border border-line bg-card px-3 text-[12.5px]";

  const filtered = useMemo(() => rows, [rows]);

  return (
    <div className="space-y-4">
      <PageHeader title={t("title")} subtitle={admin ? t("adminSubtitle") : t("subtitle")} />

      <p className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-[12px] text-muted"><Lock size={14} className="text-primary" /> {t("immutableNote")}</p>

      <div className="flex flex-wrap items-center gap-2">
        <select value={action} onChange={(e) => setAction(e.target.value)} className={sel}>
          <option value="">{t("filterAction")}</option>
          {allActions.map((a) => <option key={a} value={a}>{lbl("action", a)}</option>)}
        </select>
        <select value={entity} onChange={(e) => setEntity(e.target.value)} className={sel}>
          <option value="">{t("filterEntity")}</option>
          {allEntities.map((en) => <option key={en} value={en}>{lbl("entity", en)}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-card border border-dashed border-line bg-card py-12 text-center text-[13px] text-subtle">{t("empty")}</div>
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-card shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[12.5px]">
              <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
                <th className="px-4 py-3 text-start font-semibold">{t("col.actor")}</th>
                <th className="px-4 py-3 text-start font-semibold">{t("col.action")}</th>
                <th className="px-4 py-3 text-start font-semibold">{t("col.entity")}</th>
                {showTenant ? <th className="px-4 py-3 text-start font-semibold">{t("col.tenant")}</th> : null}
                <th className="px-4 py-3 text-start font-semibold">{t("col.ip")}</th>
                <th className="px-4 py-3 text-start font-semibold">{t("col.device")}</th>
                <th className="px-4 py-3 text-start font-semibold">{t("col.time")}</th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-2/50 align-top">
                    <td className="px-4 py-2.5"><span className="inline-flex items-center gap-1.5 font-medium text-ink"><User size={13} className="text-subtle" /> {r.actor}</span></td>
                    <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ACTION_TONE[r.action] ?? "bg-surface-2 text-muted"}`}>{lbl("action", r.action)}</span></td>
                    <td className="px-4 py-2.5 text-ink">{lbl("entity", r.entity)} {r.entityId ? <span className="text-[10.5px] text-subtle tnum" dir="ltr">#{r.entityId.slice(-6)}</span> : null}</td>
                    {showTenant ? <td className="px-4 py-2.5 text-[11px] text-muted tnum" dir="ltr">{r.tenantId}</td> : null}
                    <td className="px-4 py-2.5 text-muted tnum" dir="ltr">{r.ipAddress ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted" dir="ltr">{device(r.userAgent)}</td>
                    <td className="px-4 py-2.5 text-subtle tnum" dir="ltr">{time(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
