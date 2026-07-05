"use client";

import { useEffect, useState } from "react";
import { Network, Plus, Trash2, Users, Shield, GitBranch, ListTree } from "lucide-react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "@/lib/api";

interface Role { id: string; name: string }
interface DeptNode { id: string; name: string; parentId: string | null; defaultRole: { id: string; name: string } | null; memberCount: number; children: DeptNode[] }

// أنماط المخطط الهرمي (موصلات CSS، متوافقة مع RTL) — تُحقَن عبر dangerouslySetInnerHTML
// لتفادي عدم تطابق الترطيب (hydration) الناتج عن محرف «>» في المُحدِّدات داخل عقدة نصّية.
const OC_CSS = `
.oc-tree, .oc-tree ul { list-style: none; margin: 0; padding: 0; display: flex; justify-content: center; }
.oc-tree ul { padding-top: 22px; position: relative; }
.oc-tree li { position: relative; padding: 22px 8px 0; text-align: center; }
.oc-tree li::before, .oc-tree li::after { content: ""; position: absolute; top: 0; inset-inline-end: 50%; width: 50%; height: 22px; border-top: 2px solid var(--border); }
.oc-tree li::after { inset-inline-end: auto; inset-inline-start: 50%; border-inline-start: 2px solid var(--border); }
.oc-tree li:first-child::before, .oc-tree li:last-child::after { border: 0 none; }
.oc-tree li:last-child::before { border-inline-end: 2px solid var(--border); }
.oc-tree ul ul::before { content: ""; position: absolute; top: 0; inset-inline-start: 50%; width: 0; height: 22px; border-inline-start: 2px solid var(--border); }
.oc-tree li:only-child { padding-top: 22px; }
.oc-tree li:only-child::before, .oc-tree li:only-child::after { display: none; }
.oc-tree > li { padding-top: 0; }
.oc-tree > li::before, .oc-tree > li::after { display: none; }
`;

export default function OrgPage() {
  const t = useTranslations("org");
  const [tree, setTree] = useState<DeptNode[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [form, setForm] = useState({ name: "", parentId: "", defaultRoleId: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"chart" | "manage">("chart");

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

  // القائمة المسطّحة الإدارية (مع إجراءات الحذف)
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

  // عقدة المخطط الهرمي (بطاقة قسم + أبناؤها أفقيًا تحته، بموصلات)
  const ChartNode = ({ n }: { n: DeptNode }) => (
    <li>
      <div className="oc-node inline-flex flex-col items-center gap-1 rounded-xl border border-line bg-card px-4 py-2.5 shadow-card">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-ink"><Network size={14} className="text-primary" /> {n.name}</span>
        <span className="inline-flex items-center gap-1 text-[11px] text-subtle"><Users size={11} /> {n.memberCount} {t("members")}</span>
        {n.defaultRole ? <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[10.5px] font-medium text-primary"><Shield size={10} /> {n.defaultRole.name}</span> : null}
      </div>
      {n.children.length ? <ul>{n.children.map((c) => <ChartNode key={c.id} n={c} />)}</ul> : null}
    </li>
  );

  const tab = (v: "chart" | "manage", icon: React.ReactNode, label: string) => (
    <button onClick={() => setView(v)}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] transition ${view === v ? "bg-card font-semibold text-ink shadow-sm" : "font-medium text-subtle hover:text-ink"}`}>
      {icon} {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Network size={20} /></div>
        <div>
          <h1 className="text-lg font-bold text-ink">{t("title")}</h1>
          <p className="text-[12.5px] text-subtle">{t("subtitle")}</p>
        </div>
        <div className="ms-auto inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
          {tab("chart", <GitBranch size={14} />, t("tabChart"))}
          {tab("manage", <ListTree size={14} />, t("tabManage"))}
        </div>
      </header>

      {error ? <p className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}

      {view === "chart" ? (
        <section className="rounded-card border border-line bg-card p-5">
          <p className="mb-4 text-[12px] text-subtle">{t("chartHint")}</p>
          {tree.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-subtle">{t("empty")}</p>
          ) : (
            <div className="overflow-x-auto pb-4">
              <ul className="oc-tree">{tree.map((n) => <ChartNode key={n.id} n={n} />)}</ul>
            </div>
          )}
        </section>
      ) : (
        <>
          <section className="rounded-card border border-line bg-card p-5">
            <h2 className="mb-3 flex items-center gap-1.5 text-[13px] font-bold text-ink"><Plus size={15} /> {t("addDepartment")}</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("nameField")} className={field} />
              <select value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })} className={field}>
                <option value="">{t("noParent")}</option>
                {flat.map((d) => <option key={d.id} value={d.id}>{" ".repeat(d.depth * 2)}{d.name}</option>)}
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

          <section className="rounded-card border border-line bg-card p-5">
            {tree.length === 0 ? (
              <p className="py-6 text-center text-[12.5px] text-subtle">{t("empty")}</p>
            ) : (
              <div className="space-y-1.5">{tree.map((n) => <Node key={n.id} n={n} depth={0} />)}</div>
            )}
          </section>
        </>
      )}

      <style dangerouslySetInnerHTML={{ __html: OC_CSS }} />
    </div>
  );
}
