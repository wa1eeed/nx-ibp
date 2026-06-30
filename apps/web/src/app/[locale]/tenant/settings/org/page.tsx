"use client";

import { useEffect, useState } from "react";
import { Network, Plus, Trash2, Users, Shield } from "lucide-react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "@/lib/api";

interface Role { id: string; name: string }
interface DeptNode { id: string; name: string; parentId: string | null; defaultRole: { id: string; name: string } | null; memberCount: number; children: DeptNode[] }

export default function OrgPage() {
  const t = useTranslations("org");
  const [tree, setTree] = useState<DeptNode[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [form, setForm] = useState({ name: "", parentId: "", defaultRoleId: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const [tr, rs] = await Promise.all([api<DeptNode[]>("/org/departments"), api<Role[]>("/org/departments/roles")]);
    setTree(tr); setRoles(rs);
  }
  useEffect(() => { load().catch(() => setError(t("error"))); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // قائمة مسطّحة لاختيار القسم الأب
  const flat: { id: string; name: string; depth: number }[] = [];
  const walk = (nodes: DeptNode[], depth: number) => nodes.forEach((n) => { flat.push({ id: n.id, name: n.name, depth }); walk(n.children, depth + 1); });
  walk(tree, 0);

  async function create() {
    if (form.name.trim().length < 2) return;
    setBusy(true); setError("");
    try {
      await api("/org/departments", { method: "POST", body: JSON.stringify({ name: form.name.trim(), parentId: form.parentId || undefined, defaultRoleId: form.defaultRoleId || undefined }) });
      setForm({ name: "", parentId: "", defaultRoleId: "" });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("error"));
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!window.confirm(t("deleteConfirm"))) return;
    try { await api(`/org/departments/${id}`, { method: "DELETE" }); await load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : t("error")); }
  }

  const field = "h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30";

  const Node = ({ n, depth }: { n: DeptNode; depth: number }) => (
    <div>
      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2/40 px-3 py-2" style={{ marginInlineStart: depth * 20 }}>
        <Network size={15} className="text-primary" />
        <span className="font-semibold text-ink text-[13px]">{n.name}</span>
        <span className="inline-flex items-center gap-1 text-[11.5px] text-subtle"><Users size={12} /> {n.memberCount} {t("members")}</span>
        {n.defaultRole ? <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"><Shield size={11} /> {n.defaultRole.name}</span> : null}
        <button onClick={() => remove(n.id)} className="ms-auto text-subtle hover:text-danger" title={t("delete")}><Trash2 size={14} /></button>
      </div>
      {n.children.length ? <div className="mt-1.5 space-y-1.5">{n.children.map((c) => <Node key={c.id} n={c} depth={depth + 1} />)}</div> : null}
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Network size={20} /></div>
        <div>
          <h1 className="text-lg font-bold text-ink">{t("title")}</h1>
          <p className="text-[12.5px] text-subtle">{t("subtitle")}</p>
        </div>
      </header>

      {error ? <p className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}

      {/* إضافة قسم */}
      <section className="rounded-card border border-line bg-card p-5">
        <h2 className="mb-3 flex items-center gap-1.5 text-[13px] font-bold text-ink"><Plus size={15} /> {t("addDepartment")}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("nameField")} className={field} />
          <select value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })} className={field}>
            <option value="">{t("noParent")}</option>
            {flat.map((d) => <option key={d.id} value={d.id}>{" ".repeat(d.depth * 2)}{d.name}</option>)}
          </select>
          <select value={form.defaultRoleId} onChange={(e) => setForm({ ...form, defaultRoleId: e.target.value })} className={field}>
            <option value="">{t("noRole")}</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <button onClick={create} disabled={busy || form.name.trim().length < 2} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-strong px-4 text-[12.5px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60">
          <Plus size={15} /> {t("create")}
        </button>
      </section>

      {/* الشجرة */}
      <section className="rounded-card border border-line bg-card p-5">
        {tree.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] text-subtle">{t("empty")}</p>
        ) : (
          <div className="space-y-1.5">{tree.map((n) => <Node key={n.id} n={n} depth={0} />)}</div>
        )}
      </section>
    </div>
  );
}
