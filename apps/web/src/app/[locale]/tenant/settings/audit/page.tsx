"use client";

import { api } from "@/lib/api";
import { AuditLogView } from "@/components/audit/AuditLogView";

/** سجل تدقيق الشركة — «من فعل ماذا ومتى» (صلاحية الالتزام). */
export default function TenantAuditPage() {
  return <AuditLogView fetcher={api} endpoint="/audit" />;
}
