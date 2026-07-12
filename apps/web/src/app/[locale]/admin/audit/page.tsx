"use client";

import { papi } from "@/lib/api";
import { AdminShell } from "@/components/admin/AdminShell";
import { AuditLogView } from "@/components/audit/AuditLogView";

/** سجل التدقيق عابر الحسابات — للسوبر أدمن (مراجعة الهيئة). */
export default function AdminAuditPage() {
  return (
    <AdminShell>
      <AuditLogView fetcher={papi} endpoint="/platform/audit" showTenant admin />
    </AdminShell>
  );
}
