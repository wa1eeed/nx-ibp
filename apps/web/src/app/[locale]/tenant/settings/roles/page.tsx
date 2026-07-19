"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, Plus, Save, Trash2, Lock, Users, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { RBAC_MODULES, type RbacModule } from "@ibp/shared";
import { useRouter } from "@/i18n/routing";
import { api, getToken, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";

interface PermRow { canAccess: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean; canRevert: boolean }
type Matrix = Record<string, PermRow>;
interface Role { id: string; name: string; isPreset: boolean; permissions: Array<{ module: string } & PermRow>; userCount: number; deptDefaultCount: number }

const EMPTY: PermRow = { canAccess: false, canCreate: false, canEdit: false, canDelete: false, canRevert: false };
const emptyMatrix = (): Matrix => Object.fromEntries(RBAC_MODULES.map((m) => [m, { ...EMPTY }]));
const FIELDS: Array<keyof PermRow> = ["canAccess", "canCreate", "canEdit", "canDelete", "canRevert"];
const FIELD_KEY: Record<keyof PermRow, string> = {
  canAccess: "staff.colAccess", canCreate: "staff.colCreate", canEdit: "staff.colEdit", canDelete: "staff.colDelete", canRevert: "roles.colRevert",
};

export default function RolesPage() {
  const t = useTranslations();
  const router = useRouter();

  const [roles, setRoles] = useState<Role[]>([]);
  const [forbidden, setForbidden] = useState(false);
  const [selId, setSelId] = useState<string | "new" | null>(null);
  const [name, setName] = useState("");
  const [matrix, setMatrix] = useState<Matrix>(emptyMatrix());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<Role[]>("/roles");
      setRoles(r);
      setForbidden(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setForbidden(true);
    }
  }, []);

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    void load();
  }, [load, router]);

  function selectRole(r: Role) {
    setSelId(r.id); setName(r.name); setError("");
    const next = emptyMatrix();
    r.permissions.forEach((p) => { if (next[p.module]) next[p.module] = { canAccess: p.canAccess, canCreate: p.canCreate, canEdit: p.canEdit, canDelete: p.canDelete, canRevert: p.canRevert }; });
    setMatrix(next);
  }
  function startNew() { setSelId("new"); setName(""); setMatrix(emptyMatrix()); setError(""); }
  function toggle(module: string, field: keyof PermRow) {
    setMatrix((m) => ({ ...m, [module]: { ...m[module], [field]: !m[module][field] } }));
  }

  const selected = selId && selId !== "new" ? roles.find((r) => r.id === selId) ?? null : null;

  async function save() {
    setSaving(true); setError("");
    const permissions = RBAC_MODULES.map((m) => ({ module: m, ...matrix[m] }));
    try {
      if (selId === "new") await api("/roles", { method: "POST", body: JSON.stringify({ name, permissions }) });
      else if (selId) await api(`/roles/${selId}`, { method: "PUT", body: JSON.stringify({ name, permissions }) });
      await load();
      setSelId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("roles.errGeneric"));
    } finally { setSaving(false); }
  }

  async function remove(r: Role) {
    if (!window.confirm(t("roles.deleteConfirm", { name: r.name }))) return;
    setError("");
    try { await api(`/roles/${r.id}`, { method: "DELETE" }); await load(); if (selId === r.id) setSelId(null); }
    catch (err) { setError(err instanceof ApiError ? err.message : t("roles.errGeneric")); }
  }

  if (forbidden) {
    return <div><PageHeader title={t("roles.title")} subtitle={t("roles.subtitle")} /><div className="rounded-card border border-dashed border-line bg-card p-8 text-center text-[13px] text-muted shadow-card">{t("staff.forbidden")}</div></div>;
  }

  return (
    <div>
      <PageHeader title={t("roles.title")} subtitle={t("roles.subtitle")}
        actions={<button onClick={startNew} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-strong px-3.5 py-2 text-[13px] font-semibold text-primary-fg shadow-sm hover:bg-primary"><Plus size={16} /> {t("roles.new")}</button>}
      />

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        {/* قائمة الأدوار */}
        <div className="space-y-2">
          {roles.map((r) => (
            <button key={r.id} onClick={() => selectRole(r)}
              className={["flex w-full items-center justify-between gap-2 rounded-xl border p-3 text-start transition-colors", selId === r.id ? "border-primary bg-primary-soft" : "border-line bg-card hover:bg-surface-2"].join(" ")}>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink"><ShieldCheck size={14} className="shrink-0 text-primary" /> <span className="truncate">{r.name}</span></div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-subtle">
                  <span className="inline-flex items-center gap-1"><Users size={11} /> {r.userCount}</span>
                  {r.isPreset ? <Badge tone="info">{t("roles.preset")}</Badge> : <Badge tone="neutral">{t("roles.custom")}</Badge>}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* المحرّر */}
        {selId ? (
          <div className="rounded-card border border-line bg-card p-5 shadow-card">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[14px] font-semibold text-ink"><ShieldCheck size={17} className="text-primary" /> {selId === "new" ? t("roles.new") : t("roles.edit")}</div>
              {selected && !selected.isPreset ? (
                <button onClick={() => remove(selected)} disabled={selected.userCount > 0 || selected.deptDefaultCount > 0}
                  title={selected.userCount > 0 ? t("roles.inUse") : ""}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-danger/30 px-2.5 py-1.5 text-[12px] font-semibold text-danger hover:bg-danger/10 disabled:opacity-40">
                  <Trash2 size={13} /> {t("roles.delete")}
                </button>
              ) : selected?.isPreset ? <span className="inline-flex items-center gap-1 text-[11.5px] text-subtle"><Lock size={12} /> {t("roles.presetNote")}</span> : null}
            </div>

            <label className="block max-w-sm">
              <span className="mb-1 block text-[12px] font-medium text-muted">{t("roles.name")}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className="h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </label>

            <div className="mt-4">
              <div className="mb-2 text-[12.5px] font-semibold text-ink">{t("staff.matrix")}</div>
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="border-b border-line bg-surface-2 text-subtle">
                      <th className="px-3 py-2 text-start font-semibold">—</th>
                      {FIELDS.map((f) => <th key={f} className="px-2 py-2 text-center font-semibold">{t(FIELD_KEY[f])}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {RBAC_MODULES.map((m: RbacModule) => (
                      <tr key={m} className="hover:bg-surface-2/60">
                        <td className="px-3 py-1.5 text-ink">{t(`modules.${m}`)}</td>
                        {FIELDS.map((f) => (
                          <td key={f} className="px-2 py-1.5 text-center">
                            <input type="checkbox" checked={matrix[m][f]} onChange={() => toggle(m, f)} className="h-4 w-4 accent-[var(--primary)]" />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {error ? <p className="mt-3 text-[12.5px] font-medium text-danger">{error}</p> : null}

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setSelId(null)} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[12.5px] font-medium text-muted hover:bg-surface-2"><X size={15} /> {t("roles.cancel")}</button>
              <button onClick={save} disabled={saving || name.trim().length < 2} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-strong px-4 py-2 text-[13px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60"><Save size={15} /> {saving ? "…" : t("roles.save")}</button>
            </div>
          </div>
        ) : (
          <div className="grid place-items-center rounded-card border border-dashed border-line bg-card p-10 text-center text-[13px] text-muted shadow-card">
            {t("roles.pickHint")}
          </div>
        )}
      </div>
    </div>
  );
}
