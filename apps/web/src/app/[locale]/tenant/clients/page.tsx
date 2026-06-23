"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus, Building2, User, X, Check, Ban } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { api, getToken, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

interface ClientRow {
  id: string;
  code: string | null;
  type: "CORPORATE" | "INDIVIDUAL";
  name: string;
  crNumber: string | null;
  complianceStatus: "PENDING" | "APPROVED" | "REJECTED";
}

const COMPLIANCE_TONE: Record<string, BadgeTone> = { APPROVED: "success", PENDING: "warning", REJECTED: "danger" };

export default function ClientsPage() {
  const t = useTranslations();
  const router = useRouter();
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [type, setType] = useState<"CORPORATE" | "INDIVIDUAL">("CORPORATE");
  const [name, setName] = useState("");
  const [crNumber, setCrNumber] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");

  const load = useCallback(async () => {
    const cs = await api<ClientRow[]>("/clients");
    setRows(cs);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    void load().catch(() => undefined);
  }, [load, router]);

  async function createClient(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api("/clients", {
        method: "POST",
        body: JSON.stringify({
          type,
          name,
          crNumber: type === "CORPORATE" ? crNumber : undefined,
          nationalId: type === "INDIVIDUAL" ? nationalId : undefined,
          email: email || undefined,
          city: city || undefined,
        }),
      });
      setShowForm(false);
      setName(""); setCrNumber(""); setNationalId(""); setEmail(""); setCity("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطأ");
    } finally {
      setSaving(false);
    }
  }

  async function decide(id: string, decision: "APPROVED" | "REJECTED") {
    setError("");
    try {
      await api(`/clients/${id}/compliance`, { method: "POST", body: JSON.stringify({ decision }) });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطأ");
    }
  }

  return (
    <div>
      <PageHeader
        title={t("clients.title")}
        subtitle={t("clients.subtitle")}
        actions={
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-strong px-3.5 py-2 text-[13px] font-semibold text-primary-fg shadow-sm transition-colors hover:bg-primary"
          >
            {showForm ? <X size={16} /> : <Plus size={16} />}
            {showForm ? t("clients.cancel") : t("clients.newClient")}
          </button>
        }
      />

      {error ? <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}

      {showForm ? (
        <form onSubmit={createClient} className="mb-4 grid grid-cols-1 gap-3 rounded-card border border-line bg-card p-5 shadow-card sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-muted">{t("clients.type.label")}</span>
            <select value={type} onChange={(e) => setType(e.target.value as "CORPORATE" | "INDIVIDUAL")} className="h-9 w-full rounded-lg border border-line bg-card px-2 text-[13px]">
              <option value="CORPORATE">{t("clients.type.corporate")}</option>
              <option value="INDIVIDUAL">{t("clients.type.individual")}</option>
            </select>
          </label>
          <Field label={t("clients.table.client")} value={name} onChange={setName} required />
          {type === "CORPORATE" ? (
            <Field label="CR" value={crNumber} onChange={setCrNumber} />
          ) : (
            <Field label={t("clients.nationalId")} value={nationalId} onChange={setNationalId} />
          )}
          <Field label={t("clients.email")} value={email} onChange={setEmail} type="email" />
          <Field label={t("clients.table.city")} value={city} onChange={setCity} />
          <div className="flex items-end">
            <button type="submit" disabled={saving} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-strong px-4 text-[13px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60">
              {saving ? "…" : t("clients.create")}
            </button>
          </div>
        </form>
      ) : null}

      <div className="overflow-hidden rounded-card border border-line bg-card shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
                <th className="px-5 py-3 text-start font-semibold">{t("clients.code")}</th>
                <th className="px-5 py-3 text-start font-semibold">{t("clients.table.client")}</th>
                <th className="px-5 py-3 text-start font-semibold">CR</th>
                <th className="px-5 py-3 text-start font-semibold">{t("clients.compliance")}</th>
                <th className="px-5 py-3 text-start font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-surface-2/60">
                  <td className="px-5 py-3 text-[12px] text-subtle tnum">{c.code ?? "—"}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${c.type === "CORPORATE" ? "bg-info-soft text-info" : "bg-primary-soft text-primary"}`}>
                        {c.type === "CORPORATE" ? <Building2 size={16} /> : <User size={16} />}
                      </span>
                      <span className="text-[13.5px] font-medium text-ink">{c.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-[12.5px] text-muted tnum">{c.crNumber ?? "—"}</td>
                  <td className="px-5 py-3">
                    <Badge tone={COMPLIANCE_TONE[c.complianceStatus]}>{t(`clients.complianceStatus.${c.complianceStatus}`)}</Badge>
                  </td>
                  <td className="px-5 py-3">
                    {c.complianceStatus === "PENDING" ? (
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => decide(c.id, "APPROVED")} title={t("clients.approve")} className="grid h-7 w-7 place-items-center rounded-md bg-success-soft text-success hover:opacity-80">
                          <Check size={15} />
                        </button>
                        <button onClick={() => decide(c.id, "REJECTED")} title={t("clients.reject")} className="grid h-7 w-7 place-items-center rounded-md bg-danger-soft text-danger hover:opacity-80">
                          <Ban size={15} />
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-muted">{label}</span>
      <input type={type} value={value} required={required} onChange={(e) => onChange(e.target.value)} className="h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30" />
    </label>
  );
}
