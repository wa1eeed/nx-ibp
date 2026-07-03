"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight, Activity, FileCheck2, CheckCircle2, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { api, getToken } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";

interface Detail {
  user: { id: string; fullName: string; email: string; status: string; createdAt: string; role: { name: string } | null; department: { name: string } | null };
  activity: Array<{ action: string; entity: string; entityId: string | null; meta: unknown; createdAt: string }>;
  stats: { totalActions: number; policiesCreated: number; approvals: number };
}

const dt = (s: string) => new Date(s).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
const ACTION_AR: Record<string, string> = { create: "إنشاء", update: "تحديث", approve: "اعتماد", verify: "تحقّق", revert: "تراجع", login: "دخول", delete: "حذف", file_url: "فتح مستند", seed: "بذر" };

export default function StaffDetailPage() {
  const t = useTranslations("staffDetail");
  const params = useParams();
  const id = String(params.id);
  const [d, setD] = useState<Detail | null>(null);

  const load = useCallback(async () => {
    try { setD(await api<Detail>(`/staff/${id}`)); } catch { /* تجاهل */ }
  }, [id]);
  useEffect(() => { if (getToken()) void load(); }, [load]);

  if (!d) return <div className="grid min-h-[40vh] place-items-center text-subtle">…</div>;
  const u = d.user;

  const kpi = (label: string, value: number, Icon: typeof Activity) => (
    <div className="rounded-card border border-line bg-card p-3">
      <div className="flex items-center justify-between"><span className="text-[11.5px] text-subtle">{label}</span><Icon size={15} className="text-subtle" /></div>
      <div className="mt-1 text-[19px] font-bold text-ink tnum">{value}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      <Link href="/tenant/settings/staff" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-ink"><ArrowRight size={14} className="rtl:rotate-180" /> {t("back")}</Link>

      <header className="flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-[18px] font-bold text-primary-strong">{u.fullName.trim().charAt(0)}</div>
        <div>
          <h1 className="text-[20px] font-bold text-ink">{u.fullName}</h1>
          <p className="text-[12.5px] text-subtle">{u.email}</p>
        </div>
        <Badge tone={u.status === "ACTIVE" ? "success" : "neutral"}>{u.status}</Badge>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr]">
        <div className="rounded-card border border-line bg-card p-4">
          <dl className="space-y-1.5 text-[12.5px]">
            <div className="flex justify-between"><dt className="text-subtle">{t("role")}</dt><dd className="font-medium text-ink">{u.role?.name ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-subtle">{t("department")}</dt><dd className="font-medium text-ink">{u.department?.name ?? t("noDept")}</dd></div>
            <div className="flex justify-between"><dt className="text-subtle">{t("joined")}</dt><dd className="font-medium text-ink">{new Date(u.createdAt).toLocaleDateString("en-GB")}</dd></div>
          </dl>
        </div>
        {kpi(t("stats.total"), d.stats.totalActions, Activity)}
        <div className="grid grid-cols-2 gap-3">
          {kpi(t("stats.issued"), d.stats.policiesCreated, FileCheck2)}
          {kpi(t("stats.approvals"), d.stats.approvals, CheckCircle2)}
        </div>
      </div>

      <section>
        <h2 className="mb-2.5 text-[13.5px] font-bold text-ink">{t("activity")}</h2>
        {d.activity.length === 0 ? <p className="rounded-card border border-dashed border-line px-3 py-8 text-center text-[12.5px] text-subtle">{t("empty")}</p> : (
          <ol className="relative space-y-3 border-s-2 border-line ps-4">
            {d.activity.map((a, i) => (
              <li key={i} className="relative">
                <span className="absolute -start-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-card" />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] text-ink"><span className="font-semibold">{ACTION_AR[a.action] ?? a.action}</span> · {a.entity}{a.entityId ? ` (${a.entityId.slice(0, 8)})` : ""}</span>
                  <span className="shrink-0 text-[11px] text-subtle"><Clock size={10} className="inline" /> {dt(a.createdAt)}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
