"use client";

import { useEffect, useState } from "react";
import { Building2, Users, FileText, FileCheck2, ClipboardList, BadgeCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { papi } from "@/lib/api";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";

interface Usage { tenants: number; users: number; clients: number; policies: number; requests: number; claims: number; verificationChecks: number }

export default function AdminUsagePage() {
  const t = useTranslations();
  const [u, setU] = useState<Usage | null>(null);
  useEffect(() => { void papi<Usage>("/platform/usage").then(setU).catch(() => undefined); }, []);

  return (
    <AdminShell>
      <PageHeader title={t("admin.usage.title")} subtitle={t("admin.usage.subtitle")} />
      {u ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard tone="primary" icon={<Building2 size={18} />} title={t("admin.usage.tenants")} value={u.tenants} />
          <StatCard tone="info" icon={<Users size={18} />} title={t("admin.usage.users")} value={u.users} />
          <StatCard tone="success" icon={<Users size={18} />} title={t("admin.usage.clients")} value={u.clients} />
          <StatCard tone="primary" icon={<FileCheck2 size={18} />} title={t("admin.usage.policies")} value={u.policies} />
          <StatCard tone="warning" icon={<FileText size={18} />} title={t("admin.usage.requests")} value={u.requests} />
          <StatCard tone="danger" icon={<ClipboardList size={18} />} title={t("admin.usage.claims")} value={u.claims} />
          <StatCard tone="info" icon={<BadgeCheck size={18} />} title={t("admin.usage.checks")} value={u.verificationChecks} />
        </div>
      ) : null}
    </AdminShell>
  );
}
