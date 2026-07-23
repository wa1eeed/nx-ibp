"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { AttendanceWidget } from "@/components/hr/AttendanceWidget";

interface Row { id: string; workDate: string; checkInAt: string | null; checkOutAt: string | null; source: string }
interface TeamRow { userId: string; name: string; department: string | null; checkInAt: string | null; checkOutAt: string | null; status: string }
interface Team { date: string; rows: TeamRow[] }

const STATUS_TONE: Record<string, BadgeTone> = { in: "success", out: "info", absent: "neutral" };

export default function AttendancePage() {
  const t = useTranslations("attendance");
  const [mine, setMine] = useState<Row[]>([]);
  const [team, setTeam] = useState<Team | null>(null); // null = ليس مديرًا
  const [date, setDate] = useState("");

  const loadTeam = useCallback(async (d?: string) => {
    try { setTeam(await api<Team>(`/hr/attendance/team${d ? `?date=${d}` : ""}`)); } catch (e) { if (e instanceof ApiError && e.status === 403) setTeam(null); }
  }, []);
  useEffect(() => {
    void api<Row[]>("/hr/attendance/mine?days=30").then(setMine).catch(() => undefined);
    void loadTeam();
  }, [loadTeam]);

  const time = (s: string | null) => (s ? new Date(s).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—");
  const day = (s: string) => new Date(s).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "2-digit" });
  const dur = (a: string | null, b: string | null) => { if (!a || !b) return "—"; const m = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000); return `${Math.floor(m / 60)}س ${m % 60}د`; };

  return (
    <div className="space-y-5">
      <PageHeader title={t("pageTitle")} subtitle={t("pageSubtitle")} />
      <AttendanceWidget />

      {/* لوحة حضور الفريق (للمديرين) */}
      {team ? (
        <section className="rounded-card border border-line bg-card shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
            <h2 className="flex items-center gap-2 text-[14px] font-bold text-ink"><Clock size={16} /> {t("teamTitle")}</h2>
            <input type="date" value={date} onChange={(e) => { setDate(e.target.value); void loadTeam(e.target.value); }} className="rounded-lg border border-line bg-bg px-2.5 py-1.5 text-[12.5px] text-ink" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead><tr className="border-b border-line text-[11px] uppercase text-subtle">
                <th className="px-5 py-2.5 text-start font-semibold">{t("col.employee")}</th>
                <th className="px-5 py-2.5 text-start font-semibold">{t("col.dept")}</th>
                <th className="px-5 py-2.5 text-start font-semibold">{t("in")}</th>
                <th className="px-5 py-2.5 text-start font-semibold">{t("out")}</th>
                <th className="px-5 py-2.5 text-start font-semibold">{t("col.status")}</th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {team.rows.map((r) => (
                  <tr key={r.userId} className="hover:bg-surface-2/50">
                    <td className="px-5 py-2.5 text-[13px] font-medium text-ink">{r.name}</td>
                    <td className="px-5 py-2.5 text-[12px] text-muted">{r.department ?? "—"}</td>
                    <td className="px-5 py-2.5 text-[12.5px] text-muted tnum">{time(r.checkInAt)}</td>
                    <td className="px-5 py-2.5 text-[12.5px] text-muted tnum">{time(r.checkOutAt)}</td>
                    <td className="px-5 py-2.5"><Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{t(`status.${r.status}`)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* سجلّي الشخصي */}
      <section className="rounded-card border border-line bg-card shadow-card">
        <div className="border-b border-line px-5 py-3 text-[14px] font-bold text-ink">{t("mineTitle")}</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px]">
            <thead><tr className="border-b border-line text-[11px] uppercase text-subtle">
              <th className="px-5 py-2.5 text-start font-semibold">{t("col.date")}</th>
              <th className="px-5 py-2.5 text-start font-semibold">{t("in")}</th>
              <th className="px-5 py-2.5 text-start font-semibold">{t("out")}</th>
              <th className="px-5 py-2.5 text-start font-semibold">{t("col.duration")}</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {mine.length ? mine.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2/50">
                  <td className="px-5 py-2.5 text-[13px] font-medium text-ink">{day(r.workDate)}</td>
                  <td className="px-5 py-2.5 text-[12.5px] text-muted tnum">{time(r.checkInAt)}</td>
                  <td className="px-5 py-2.5 text-[12.5px] text-muted tnum">{time(r.checkOutAt)}</td>
                  <td className="px-5 py-2.5 text-[12.5px] text-muted tnum">{dur(r.checkInAt, r.checkOutAt)}</td>
                </tr>
              )) : <tr><td colSpan={4} className="px-5 py-6 text-center text-[12.5px] text-subtle">{t("mineEmpty")}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
