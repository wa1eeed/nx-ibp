"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus, UserPlus, ShieldCheck, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { RBAC_MODULES, type RbacModule } from "@ibp/shared";
import { Link, useRouter } from "@/i18n/routing";
import { api, getToken, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";

interface PermRow { canAccess: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean }
type Matrix = Record<string, PermRow>;
interface StaffRow { id: string; fullName: string; email: string; status: string; role?: { name: string } | null }
interface RoleTemplate { id: string; name: string; permissions: Array<{ module: string } & PermRow> }

const EMPTY: PermRow = { canAccess: false, canCreate: false, canEdit: false, canDelete: false };
const emptyMatrix = (): Matrix => Object.fromEntries(RBAC_MODULES.map((m) => [m, { ...EMPTY }]));
const FIELDS: Array<keyof PermRow> = ["canAccess", "canCreate", "canEdit", "canDelete"];
const FIELD_KEY: Record<keyof PermRow, string> = {
  canAccess: "staff.colAccess",
  canCreate: "staff.colCreate",
  canEdit: "staff.colEdit",
  canDelete: "staff.colDelete",
};

export default function StaffPage() {
  const t = useTranslations();
  const router = useRouter();

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [roles, setRoles] = useState<RoleTemplate[]>([]);
  const [forbidden, setForbidden] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // حقول النموذج
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleName, setRoleName] = useState("");
  const [matrix, setMatrix] = useState<Matrix>(emptyMatrix());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([api<StaffRow[]>("/staff"), api<RoleTemplate[]>("/staff/roles")]);
      setStaff(s);
      setRoles(r);
      setForbidden(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setForbidden(true);
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    // رابط عميق: ?new=1 يفتح نموذج إضافة موظف مباشرةً
    if (new URLSearchParams(window.location.search).get("new") === "1") setShowForm(true);
    void load();
  }, [load, router]);

  function applyTemplate(roleId: string) {
    const role = roles.find((r) => r.id === roleId);
    setRoleName(role?.name ?? "");
    const next = emptyMatrix();
    role?.permissions.forEach((p) => {
      if (next[p.module]) next[p.module] = { canAccess: p.canAccess, canCreate: p.canCreate, canEdit: p.canEdit, canDelete: p.canDelete };
    });
    setMatrix(next);
  }

  function toggle(module: string, field: keyof PermRow) {
    setMatrix((m) => ({ ...m, [module]: { ...m[module], [field]: !m[module][field] } }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api("/staff", {
        method: "POST",
        body: JSON.stringify({
          fullName,
          email,
          password,
          roleName,
          permissions: RBAC_MODULES.map((m) => ({ module: m, ...matrix[m] })),
        }),
      });
      setShowForm(false);
      setFullName(""); setEmail(""); setPassword(""); setRoleName(""); setMatrix(emptyMatrix());
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطأ");
    } finally {
      setSaving(false);
    }
  }

  if (forbidden) {
    return (
      <div>
        <PageHeader title={t("staff.title")} subtitle={t("staff.subtitle")} />
        <div className="rounded-card border border-dashed border-line bg-card p-8 text-center text-[13px] text-muted shadow-card">
          {t("staff.forbidden")}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t("staff.title")}
        subtitle={t("staff.subtitle")}
        actions={
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-strong px-3.5 py-2 text-[13px] font-semibold text-primary-fg shadow-sm transition-colors hover:bg-primary"
          >
            {showForm ? <X size={16} /> : <Plus size={16} />}
            {showForm ? t("staff.cancel") : t("staff.new")}
          </button>
        }
      />

      {showForm ? (
        <form onSubmit={onSubmit} className="mb-5 rounded-card border border-line bg-card p-5 shadow-card">
          <div className="mb-4 flex items-center gap-2 text-[14px] font-semibold text-ink">
            <UserPlus size={17} className="text-primary" />
            {t("staff.new")}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t("staff.fullName")} value={fullName} onChange={setFullName} required />
            <Field label={t("staff.email")} value={email} onChange={setEmail} type="email" required />
            <Field label={t("staff.password")} value={password} onChange={setPassword} type="password" required />
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-muted">{t("staff.template")}</span>
              <select
                onChange={(e) => applyTemplate(e.target.value)}
                defaultValue=""
                className="h-9 w-full rounded-lg border border-line bg-card px-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="" disabled>{t("staff.templateHint")}</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-3">
            <Field label={t("staff.roleName")} value={roleName} onChange={setRoleName} required />
          </div>

          {/* مصفوفة الصلاحيات */}
          <div className="mt-4">
            <div className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
              <ShieldCheck size={15} className="text-primary" />
              {t("staff.matrix")}
            </div>
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-line bg-surface-2 text-subtle">
                    <th className="px-3 py-2 text-start font-semibold">—</th>
                    {FIELDS.map((f) => (
                      <th key={f} className="px-3 py-2 text-center font-semibold">{t(FIELD_KEY[f])}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {RBAC_MODULES.map((m: RbacModule) => (
                    <tr key={m} className="hover:bg-surface-2/60">
                      <td className="px-3 py-1.5 text-ink">{t(`modules.${m}`)}</td>
                      {FIELDS.map((f) => (
                        <td key={f} className="px-3 py-1.5 text-center">
                          <input
                            type="checkbox"
                            checked={matrix[m][f]}
                            onChange={() => toggle(m, f)}
                            className="h-4 w-4 accent-[var(--primary)]"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {error ? <p className="mt-3 text-[12.5px] font-medium text-danger">{error}</p> : null}

          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-strong px-4 py-2 text-[13px] font-semibold text-primary-fg transition-colors hover:bg-primary disabled:opacity-60"
            >
              <UserPlus size={16} />
              {saving ? "…" : t("staff.create")}
            </button>
          </div>
        </form>
      ) : null}

      {/* قائمة الموظفين */}
      <div className="overflow-hidden rounded-card border border-line bg-card shadow-card">
        <table className="w-full">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wide text-subtle">
              <th className="px-5 py-3 text-start font-semibold">{t("staff.name")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("staff.email")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("staff.role")}</th>
              <th className="px-5 py-3 text-start font-semibold">{t("staff.status")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {staff.map((u) => (
              <tr key={u.id} className="hover:bg-surface-2/60">
                <td className="px-5 py-3 text-[13.5px] font-medium"><Link href={`/tenant/settings/staff/${u.id}`} className="text-ink hover:text-primary hover:underline">{u.fullName}</Link></td>
                <td className="px-5 py-3 text-[12.5px] text-muted">{u.email}</td>
                <td className="px-5 py-3 text-[13px] text-muted">{u.role?.name ?? "—"}</td>
                <td className="px-5 py-3">
                  <Badge tone={u.status === "ACTIVE" ? "success" : "neutral"}>{u.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-muted">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </label>
  );
}
