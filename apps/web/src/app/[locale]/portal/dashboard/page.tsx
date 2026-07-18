"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileCheck2, ClipboardList, Receipt, FileText, CalendarClock, ShieldCheck, ArrowLeft } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cpapi } from "@/lib/api";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";

interface Me { name: string; code: string | null }
interface Policy { id: string; sequenceNo: string | null; insurerName: string | null; status: string; sumInsured: string | null; endDate: string | null }
interface Claim { id: string; status: string }
interface Req { policyRequests: { id: string }[]; serviceRequests: { status: string }[] }
interface Statement { outstanding: number }
interface CoverNote { id: string; sequenceNo: string | null; insurerName: string | null; productLineCode: string | null; validUntil: string; status: string; expired: boolean }

const DAY = 86_400_000;

export default function PortalDashboard() {
  const t = useTranslations();
  const locale = useLocale();
  const [me, setMe] = useState<Me | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [reqs, setReqs] = useState<Req | null>(null);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [covers, setCovers] = useState<CoverNote[]>([]);

  useEffect(() => {
    void cpapi<Me>("/portal/me").then(setMe).catch(() => undefined);
    void cpapi<Policy[]>("/portal/policies").then(setPolicies).catch(() => undefined);
    void cpapi<Claim[]>("/portal/claims").then(setClaims).catch(() => undefined);
    void cpapi<Req>("/portal/requests").then(setReqs).catch(() => undefined);
    void cpapi<Statement>("/portal/statement").then(setStatement).catch(() => undefined);
    void cpapi<CoverNote[]>("/portal/cover-notes").then(setCovers).catch(() => undefined);
  }, []);
  const activeCovers = covers.filter((c) => c.status === "active" && !c.expired);

  const openClaims = claims.filter((c) => c.status !== "CLOSED" && c.status !== "SETTLED" && c.status !== "REJECTED").length;
  const openReqs = (reqs?.policyRequests.length ?? 0) + (reqs?.serviceRequests.filter((s) => s.status !== "CLOSED").length ?? 0);
  const active = policies.filter((p) => p.status === "ISSUED");
  const now = Date.now();
  const daysLeft = (p: Policy) => (p.endDate ? Math.ceil((new Date(p.endDate).getTime() - now) / DAY) : Infinity);
  const expiring = active.filter((p) => { const d = daysLeft(p); return d >= 0 && d <= 60; }).sort((a, b) => daysLeft(a) - daysLeft(b));
  const totalSumInsured = active.reduce((s, p) => s + Number(p.sumInsured ?? 0), 0);
  const nf = (n: number) => n.toLocaleString("en-US");

  return (
    <PortalShell>
      <PageHeader title={me ? `${t("portal.dashboard.welcome")} ${me.name}` : t("portal.dashboard.title")} subtitle={t("portal.dashboard.subtitle")} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="primary" icon={<FileCheck2 size={18} />} title={t("portal.dashboard.policies")} value={active.length} />
        <StatCard tone="warning" icon={<CalendarClock size={18} />} title={t("portal.dashboard.expiring")} value={expiring.length} />
        <StatCard tone="info" icon={<ShieldCheck size={18} />} title={t("portal.dashboard.sumInsured")} value={`${nf(totalSumInsured)} ${t("common.sar")}`} />
        <StatCard tone="danger" icon={<Receipt size={18} />} title={t("portal.dashboard.outstanding")}
          value={statement ? `${nf(statement.outstanding)} ${t("common.sar")}` : "…"} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard tone="warning" icon={<ClipboardList size={18} />} title={t("portal.dashboard.openClaims")} value={openClaims} />
        <StatCard tone="info" icon={<FileText size={18} />} title={t("portal.dashboard.openRequests")} value={openReqs} />
      </div>

      {activeCovers.length > 0 ? (
        <div className="mt-6 rounded-card border border-primary/25 bg-primary-soft/20 shadow-card">
          <div className="flex items-center gap-2 border-b border-line px-5 py-3">
            <ShieldCheck size={16} className="text-primary" />
            <h2 className="text-[13.5px] font-bold text-ink">{t("portal.dashboard.coverNotesTitle")}</h2>
          </div>
          <ul className="divide-y divide-line">
            {activeCovers.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-ink">{c.sequenceNo ?? "—"} · <span className="text-muted">{c.insurerName ?? "—"}</span></p>
                  <p className="text-[11.5px] text-subtle">{t("portal.dashboard.coverValidUntil", { date: new Date(c.validUntil).toLocaleDateString("en-GB") })}</p>
                </div>
                <Link href={`/${locale}/portal/cover-notes/${c.id}`} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-line bg-card px-2.5 py-1.5 text-[12px] font-medium text-primary hover:bg-surface-2">
                  {t("portal.dashboard.viewCover")} <ArrowLeft size={13} className="ltr:rotate-180" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {expiring.length > 0 ? (
        <div className="mt-6 rounded-card border border-line bg-card shadow-card">
          <div className="flex items-center gap-2 border-b border-line px-5 py-3">
            <CalendarClock size={16} className="text-warning" />
            <h2 className="text-[13.5px] font-bold text-ink">{t("portal.dashboard.expiringTitle")}</h2>
          </div>
          <ul className="divide-y divide-line">
            {expiring.map((p) => {
              const d = daysLeft(p);
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-ink">{p.sequenceNo ?? "—"} · <span className="text-muted">{p.insurerName ?? "—"}</span></p>
                    <p className="text-[11.5px] text-subtle">{t("portal.dashboard.daysLeft", { days: d })}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={d <= 15 ? "danger" : "warning"}>{d <= 15 ? t("portal.dashboard.urgent") : t("portal.dashboard.soon")}</Badge>
                    <Link href={`/${locale}/portal/policies/${p.id}`} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium text-muted hover:bg-surface-2">
                      {t("portal.dashboard.view")} <ArrowLeft size={13} className="ltr:rotate-180" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </PortalShell>
  );
}
