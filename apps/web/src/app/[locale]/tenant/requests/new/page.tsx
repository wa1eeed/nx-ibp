"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { api, getToken, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { DynamicForm, type FormPayload, type FormSchemaData } from "@/components/forms/DynamicForm";
import type { BlockDef, SectionDef } from "@ibp/shared";

interface ClientLite { id: string; name: string; code: string | null; complianceStatus: string }
interface CatalogClass { code: string; name: string; lines: Array<{ code: string; name: string }> }
// الـ API يعيد المخطط بالحقل baseFields (الأقسام) — نحوّله إلى شكل العارض.
interface LineSchema { code: string; name: string; formSchema: { version: number; baseFields: SectionDef[]; blocks: BlockDef[] } }

export default function NewRequestPage() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();

  const [clients, setClients] = useState<ClientLite[]>([]);
  const [catalog, setCatalog] = useState<CatalogClass[]>([]);
  const [clientId, setClientId] = useState("");
  const [lineCode, setLineCode] = useState("");
  const [schema, setSchema] = useState<FormSchemaData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [cs, cat] = await Promise.all([api<ClientLite[]>("/clients"), api<CatalogClass[]>("/catalog")]);
    setClients(cs);
    setCatalog(cat);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    void load().catch(() => undefined);
    // رابط عميق: ?line=GMI يفتح نموذج الفرع مباشرةً
    const preset = new URLSearchParams(window.location.search).get("line");
    if (preset) void pickLine(preset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, router]);

  async function pickLine(code: string) {
    setLineCode(code);
    setSchema(null);
    setError("");
    if (!code) return;
    const line = await api<LineSchema>(`/catalog/lines/${code}`);
    setSchema({ sections: line.formSchema.baseFields, blocks: line.formSchema.blocks });
  }

  async function submit(payload: FormPayload) {
    setError("");
    if (!clientId) {
      setError(t("requestForm.pickClientFirst"));
      return;
    }
    setSubmitting(true);
    try {
      await api("/requests", {
        method: "POST",
        body: JSON.stringify({ clientId, productLineCode: lineCode, base: payload.base, blocks: payload.blocks }),
      });
      router.push("/tenant/requests");
    } catch (e) {
      if (e instanceof ApiError) setError(e.details?.length ? e.details.join(" | ") : e.message);
      else setError("خطأ");
    } finally {
      setSubmitting(false);
    }
  }

  const ar = locale === "ar";

  return (
    <div>
      <PageHeader title={t("requestForm.title")} subtitle={t("requestForm.subtitle")} />

      {/* اختيار العميل والفرع */}
      <div className="mb-4 grid grid-cols-1 gap-3 rounded-card border border-line bg-card p-5 shadow-card sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-muted">{t("requestForm.client")}</span>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="h-9 w-full rounded-lg border border-line bg-card px-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">—</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id} disabled={c.complianceStatus !== "APPROVED"}>
                {c.name} {c.code ? `(${c.code})` : ""} {c.complianceStatus !== "APPROVED" ? `— ${t("requestForm.notApproved")}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-muted">{t("requestForm.product")}</span>
          <select
            value={lineCode}
            onChange={(e) => pickLine(e.target.value)}
            className="h-9 w-full rounded-lg border border-line bg-card px-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">—</option>
            {catalog.map((cls) => (
              <optgroup key={cls.code} label={cls.name}>
                {cls.lines.map((l) => (
                  <option key={l.code} value={l.code}>{l.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>

      {schema ? (
        <DynamicForm key={lineCode} schema={schema} submitting={submitting} error={error} onSubmit={submit} />
      ) : (
        <div className="rounded-card border border-dashed border-line bg-card p-8 text-center text-[13px] text-muted shadow-card">
          {t("requestForm.selectProduct")}
        </div>
      )}
    </div>
  );
}
