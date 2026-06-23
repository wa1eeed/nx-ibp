"use client";

import { useEffect, useState } from "react";
import { FileCheck2, ClipboardList, Receipt, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { cpapi } from "@/lib/api";
import { PortalShell } from "@/components/portal/PortalShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";

interface Me { name: string; code: string | null }
interface Policy { id: string; status: string }
interface Claim { id: string; status: string }
interface Req { policyRequests: { id: string }[]; serviceRequests: { status: string }[] }
interface Statement { outstanding: number }

export default function PortalDashboard() {
  const t = useTranslations();
  const [me, setMe] = useState<Me | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [reqs, setReqs] = useState<Req | null>(null);
  const [statement, setStatement] = useState<Statement | null>(null);

  useEffect(() => {
    void cpapi<Me>("/portal/me").then(setMe).catch(() => undefined);
    void cpapi<Policy[]>("/portal/policies").then(setPolicies).catch(() => undefined);
    void cpapi<Claim[]>("/portal/claims").then(setClaims).catch(() => undefined);
    void cpapi<Req>("/portal/requests").then(setReqs).catch(() => undefined);
    void cpapi<Statement>("/portal/statement").then(setStatement).catch(() => undefined);
  }, []);

  const openClaims = claims.filter((c) => c.status !== "CLOSED" && c.status !== "SETTLED" && c.status !== "REJECTED").length;
  const openReqs = (reqs?.policyRequests.length ?? 0) + (reqs?.serviceRequests.filter((s) => s.status !== "CLOSED").length ?? 0);

  return (
    <PortalShell>
      <PageHeader title={me ? `${t("portal.dashboard.welcome")} ${me.name}` : t("portal.dashboard.title")} subtitle={t("portal.dashboard.subtitle")} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="primary" icon={<FileCheck2 size={18} />} title={t("portal.dashboard.policies")} value={policies.length} />
        <StatCard tone="warning" icon={<ClipboardList size={18} />} title={t("portal.dashboard.openClaims")} value={openClaims} />
        <StatCard tone="info" icon={<FileText size={18} />} title={t("portal.dashboard.openRequests")} value={openReqs} />
        <StatCard tone="danger" icon={<Receipt size={18} />} title={t("portal.dashboard.outstanding")}
          value={statement ? `${statement.outstanding.toLocaleString()} ${t("common.sar")}` : "…"} />
      </div>
    </PortalShell>
  );
}
