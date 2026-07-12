"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, UserPlus, X, Check, ChevronDown, BookmarkPlus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { api, getToken, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { DynamicForm, type FormPayload, type FormSchemaData } from "@/components/forms/DynamicForm";
import type { BlockDef, SectionDef } from "@ibp/shared";

interface ClientLite { id: string; name: string; code: string | null; type: string; crNumber: string | null; nationalId: string | null; complianceStatus: string }
interface CatalogClass { code: string; name: string; vatRate: number; lines: Array<{ code: string; name: string }> }
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

  // مكتبة القوالب: قوالب الخطّ الحالي + التعبئة الأولية + إصدار لإعادة بناء النموذج + نافذة الحفظ
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; usageCount: number }>>([]);
  const [initial, setInitial] = useState<FormPayload | null>(null);
  const [tplVer, setTplVer] = useState(0);
  const [saveTpl, setSaveTpl] = useState<FormPayload | null>(null);
  const [tplMsg, setTplMsg] = useState("");

  // اختيار العميل بالبحث + الإضافة السريعة
  const [search, setSearch] = useState("");
  const [openList, setOpenList] = useState(false);
  const [quickAdd, setQuickAdd] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // اختيار المنتج (فرع التأمين) بالبحث السريع
  const [prodSearch, setProdSearch] = useState("");
  const [prodOpen, setProdOpen] = useState(false);
  const prodBoxRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const [cs, cat] = await Promise.all([api<ClientLite[]>("/clients"), api<CatalogClass[]>("/catalog")]);
    setClients(cs);
    setCatalog(cat);
    return cs;
  }, []);

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    void load().catch(() => undefined);
    const preset = new URLSearchParams(window.location.search).get("line");
    if (preset) void pickLine(preset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, router]);

  // إغلاق القوائم عند النقر خارجها
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpenList(false);
      if (prodBoxRef.current && !prodBoxRef.current.contains(e.target as Node)) setProdOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function pickLine(code: string) {
    setLineCode(code); setSchema(null); setError(""); setInitial(null); setTplVer((v) => v + 1); setTemplates([]);
    if (!code) return;
    const [line, tpls] = await Promise.all([
      api<LineSchema>(`/catalog/lines/${code}`),
      api<Array<{ id: string; name: string; usageCount: number }>>(`/form-templates?line=${code}`).catch(() => []),
    ]);
    setSchema({ sections: line.formSchema.baseFields, blocks: line.formSchema.blocks });
    setTemplates(tpls);
  }

  const refreshTemplates = useCallback((code: string) => {
    if (!code) return;
    void api<Array<{ id: string; name: string; usageCount: number }>>(`/form-templates?line=${code}`).then(setTemplates).catch(() => undefined);
  }, []);

  // تطبيق قالب: يجلب بياناته ويعيد بناء النموذج بها
  async function applyTemplate(id: string) {
    if (!id) return;
    try {
      const tpl = await api<{ base: Record<string, unknown>; blocks: Record<string, Array<Record<string, unknown>>> | null }>(`/form-templates/${id}/apply`, { method: "POST" });
      setInitial({ base: tpl.base ?? {}, blocks: tpl.blocks ?? {} });
      setTplVer((v) => v + 1);
    } catch { /* تجاهل */ }
  }

  async function submit(payload: FormPayload) {
    setError("");
    if (!clientId) { setError(t("requestForm.pickClientFirst")); return; }
    setSubmitting(true);
    try {
      await api("/requests", { method: "POST", body: JSON.stringify({ clientId, productLineCode: lineCode, base: payload.base, blocks: payload.blocks }) });
      router.push("/tenant/requests");
    } catch (e) {
      if (e instanceof ApiError) setError(e.details?.length ? e.details.join(" | ") : e.message);
      else setError("خطأ");
    } finally { setSubmitting(false); }
  }

  const selected = clients.find((c) => c.id === clientId) ?? null;
  const q = search.trim().toLowerCase();
  const filtered = q
    ? clients.filter((c) => [c.name, c.code, c.crNumber, c.nationalId].some((v) => (v ?? "").toLowerCase().includes(q)))
    : clients;

  function selectClient(id: string) { setClientId(id); setOpenList(false); setSearch(""); }

  // المنتج (فرع التأمين) المختار + قائمة مفلترة بالبحث عبر كل الفروع/الفئات
  const allLines = catalog.flatMap((c) => c.lines.map((l) => ({ ...l, className: c.name, vatRate: c.vatRate })));
  const selectedLine = allLines.find((l) => l.code === lineCode) ?? null;
  const pq = prodSearch.trim().toLowerCase();
  const prodClasses = pq
    ? catalog
        .map((c) => ({ ...c, lines: c.lines.filter((l) => [l.name, l.code, c.name].some((x) => (x ?? "").toLowerCase().includes(pq))) }))
        .filter((c) => c.lines.length)
    : catalog;

  function selectLine(code: string) { void pickLine(code); setProdOpen(false); setProdSearch(""); }

  async function onClientAdded(newId: string) {
    setQuickAdd(false);
    const cs = await load();
    if (cs.find((c) => c.id === newId)) selectClient(newId);
  }

  return (
    <div>
      <PageHeader title={t("requestForm.title")} subtitle={t("requestForm.subtitle")} />

      <div className="mb-4 grid grid-cols-1 gap-3 rounded-card border border-line bg-card p-5 shadow-card sm:grid-cols-2">
        {/* العميل — بحث + إضافة سريعة */}
        <div className="block" ref={boxRef}>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[12px] font-medium text-muted">{t("requestForm.client")}</span>
            <button type="button" onClick={() => setQuickAdd(true)} className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary hover:underline">
              <UserPlus size={13} /> {t("requestForm.addClient")}
            </button>
          </div>

          {clients.length === 0 ? (
            // لا عملاء ⇒ إجبار على الإضافة أولًا
            <div className="rounded-lg border border-dashed border-line bg-surface-2 px-3 py-3 text-center">
              <p className="mb-2 text-[12px] text-subtle">{t("requestForm.noClientsYet")}</p>
              <button type="button" onClick={() => setQuickAdd(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-strong px-3 py-1.5 text-[12.5px] font-semibold text-primary-fg hover:bg-primary">
                <UserPlus size={14} /> {t("requestForm.addFirstClient")}
              </button>
            </div>
          ) : selected ? (
            // عميل مُختار
            <div className="flex items-center justify-between rounded-lg border border-line bg-card px-3 py-2">
              <span className="text-[13px] text-ink">
                {selected.name} {selected.code ? <span className="text-subtle">({selected.code})</span> : null}
                {selected.complianceStatus !== "APPROVED" ? <span className="ms-1 text-[11px] font-semibold text-warning">— {t("requestForm.notApproved")}</span> : null}
              </span>
              <button type="button" onClick={() => { setClientId(""); setOpenList(true); }} className="text-[11.5px] font-medium text-primary hover:underline">{t("requestForm.clearSelection")}</button>
            </div>
          ) : (
            // بحث
            <div className="relative">
              <div className="flex items-center gap-2 rounded-lg border border-line bg-card px-2.5">
                <Search size={15} className="text-subtle" />
                <input
                  value={search} onChange={(e) => { setSearch(e.target.value); setOpenList(true); }} onFocus={() => setOpenList(true)}
                  placeholder={t("requestForm.searchClient")}
                  className="h-9 w-full bg-transparent text-[13px] text-ink focus:outline-none"
                />
                <ChevronDown size={15} className="text-subtle" />
              </div>
              {openList ? (
                <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-line bg-card shadow-card">
                  {filtered.length ? filtered.map((c) => (
                    <button key={c.id} type="button" onClick={() => selectClient(c.id)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start hover:bg-surface-2">
                      <span className="text-[12.5px] text-ink">{c.name}
                        <span className="ms-1.5 text-[11px] text-subtle">{c.type === "CORPORATE" ? (c.crNumber ?? c.code) : (c.nationalId ?? c.code)}</span>
                      </span>
                      {c.complianceStatus === "APPROVED"
                        ? <Check size={13} className="shrink-0 text-success" />
                        : <span className="shrink-0 text-[10.5px] font-semibold text-warning">{t("requestForm.notApproved")}</span>}
                    </button>
                  )) : (
                    <div className="px-3 py-3 text-center text-[12px] text-subtle">
                      {t("requestForm.noClientMatch")}
                      <button type="button" onClick={() => setQuickAdd(true)} className="mt-1.5 block w-full text-[12px] font-semibold text-primary hover:underline">+ {t("requestForm.addClient")}</button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* المنتج — بحث سريع عبر كل الفروع */}
        <div className="block" ref={prodBoxRef}>
          <span className="mb-1 block text-[12px] font-medium text-muted">{t("requestForm.product")}</span>
          {selectedLine ? (
            // فرع مُختار
            <div className="flex items-center justify-between rounded-lg border border-line bg-card px-3 py-2">
              <span className="flex items-center gap-2 text-[13px] text-ink">
                {selectedLine.name}
                <span className="text-subtle">· {selectedLine.className}</span>
                <span className={["rounded px-1.5 py-0.5 text-[10px] font-semibold", selectedLine.vatRate === 0 ? "bg-success-soft text-success" : "bg-surface-2 text-subtle"].join(" ")}>
                  {selectedLine.vatRate === 0 ? t("requestForm.vatExempt") : t("requestForm.vatStandard", { rate: selectedLine.vatRate })}
                </span>
              </span>
              <button type="button" onClick={() => selectLine("")} className="text-[11.5px] font-medium text-primary hover:underline">{t("requestForm.clearSelection")}</button>
            </div>
          ) : (
            <div className="relative">
              <div className="flex items-center gap-2 rounded-lg border border-line bg-card px-2.5">
                <Search size={15} className="text-subtle" />
                <input
                  value={prodSearch} onChange={(e) => { setProdSearch(e.target.value); setProdOpen(true); }} onFocus={() => setProdOpen(true)}
                  placeholder={t("requestForm.searchProduct")}
                  className="h-9 w-full bg-transparent text-[13px] text-ink focus:outline-none"
                />
                <ChevronDown size={15} className="text-subtle" />
              </div>
              {prodOpen ? (
                <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-line bg-card shadow-card">
                  {prodClasses.length ? prodClasses.map((cls) => (
                    <div key={cls.code}>
                      <div className="sticky top-0 flex items-center justify-between bg-surface-2 px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-subtle">
                        <span>{cls.name}</span>
                        {cls.vatRate === 0 ? <span className="text-success">{t("requestForm.vatExempt")}</span> : null}
                      </div>
                      {cls.lines.map((l) => (
                        <button key={l.code} type="button" onClick={() => selectLine(l.code)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start hover:bg-surface-2">
                          <span className="text-[12.5px] text-ink">{l.name}</span>
                          <span className="text-[10.5px] text-subtle">{l.code}</span>
                        </button>
                      ))}
                    </div>
                  )) : (
                    <div className="px-3 py-3 text-center text-[12px] text-subtle">{t("requestForm.noProductMatch")}</div>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {selected && selected.complianceStatus !== "APPROVED" ? (
        <p className="mb-4 rounded-lg bg-warning-soft px-3 py-2 text-[12.5px] font-medium text-warning">{t("requestForm.clientAdded")}</p>
      ) : null}

      {/* مكتبة القوالب — تظهر عند وجود قوالب للخطّ المختار */}
      {schema && templates.length ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-card border border-line bg-card px-4 py-3 shadow-card">
          <BookmarkPlus size={15} className="text-primary" />
          <span className="text-[12.5px] font-medium text-muted">{t("requestForm.loadTemplate")}:</span>
          {templates.map((tp) => (
            <button key={tp.id} type="button" onClick={() => applyTemplate(tp.id)}
              className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface-2/50 px-2.5 py-1 text-[12px] font-medium text-ink hover:border-primary hover:bg-primary/5">
              {tp.name} {tp.usageCount > 0 ? <span className="text-[10px] text-subtle tnum">·{tp.usageCount}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      {tplMsg ? <p className="mb-4 rounded-lg bg-success-soft px-3 py-2 text-[12.5px] font-medium text-success">{tplMsg}</p> : null}

      {schema ? (
        <DynamicForm key={`${lineCode}:${tplVer}`} schema={schema} submitting={submitting} error={error} onSubmit={submit}
          initialBase={initial?.base} initialBlocks={initial?.blocks} onSaveTemplate={(p) => { setTplMsg(""); setSaveTpl(p); }} />
      ) : (
        <div className="rounded-card border border-dashed border-line bg-card p-8 text-center text-[13px] text-muted shadow-card">{t("requestForm.selectProduct")}</div>
      )}

      {quickAdd ? <QuickAddClient locale={locale} onClose={() => setQuickAdd(false)} onAdded={onClientAdded} initialName={search} /> : null}
      {saveTpl ? <SaveTemplate lineCode={lineCode} payload={saveTpl} onClose={() => setSaveTpl(null)} onSaved={(name) => { setSaveTpl(null); setTplMsg(t("requestForm.tplSaved", { name })); refreshTemplates(lineCode); }} /> : null}
    </div>
  );
}

/** نافذة حفظ النموذج الحالي كقالب قابل لإعادة الاستخدام. */
function SaveTemplate({ lineCode, payload, onClose, onSaved }: { lineCode: string; payload: FormPayload; onClose: () => void; onSaved: (name: string) => void }) {
  const t = useTranslations("requestForm");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const field = "h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30";

  async function save() {
    setErr("");
    if (name.trim().length < 2) { setErr(t("tplNameRequired")); return; }
    setSaving(true);
    try {
      await api("/form-templates", { method: "POST", body: JSON.stringify({ name: name.trim(), productLineCode: lineCode, description: description || undefined, base: payload.base, blocks: payload.blocks }) });
      onSaved(name.trim());
    } catch (e) { setErr(e instanceof ApiError ? e.message : "خطأ"); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-md rounded-card border border-line bg-card p-5 shadow-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-[15px] font-bold text-ink"><BookmarkPlus size={17} className="text-primary" /> {t("saveTemplateTitle")}</h2>
          <button onClick={onClose} className="text-subtle hover:text-ink"><X size={18} /></button>
        </div>
        <p className="mb-3 text-[12px] text-subtle">{t("saveTemplateHint")}</p>
        <div className="space-y-3">
          <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("tplName")}</span><input value={name} onChange={(e) => setName(e.target.value)} className={field} autoFocus /></label>
          <label className="block"><span className="mb-1 block text-[11.5px] font-medium text-muted">{t("tplDescription")}</span><input value={description} onChange={(e) => setDescription(e.target.value)} className={field} /></label>
          {err ? <p className="text-[12px] font-medium text-danger">{err}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="h-9 rounded-lg border border-line px-3 text-[12.5px] font-medium text-muted hover:bg-surface-2">{t("cancel")}</button>
            <button onClick={save} disabled={saving || name.trim().length < 2} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-strong px-4 text-[12.5px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60"><Check size={15} /> {saving ? "…" : t("save")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** نافذة إضافة عميل سريعة — الحد الأدنى (النوع/الاسم/الهوية أو السجل + تواصل اختياري). */
function QuickAddClient({ onClose, onAdded, initialName }: { locale: string; onClose: () => void; onAdded: (id: string) => void; initialName: string }) {
  const t = useTranslations("requestForm");
  const [type, setType] = useState<"CORPORATE" | "INDIVIDUAL">("CORPORATE");
  const [name, setName] = useState(initialName);
  const [ident, setIdent] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setErr("");
    if (name.trim().length < 2) { setErr(t("clientName")); return; }
    setSaving(true);
    try {
      const body = { type, name: name.trim(), ...(type === "CORPORATE" ? { crNumber: ident || undefined } : { nationalId: ident || undefined }), phone: phone || undefined, email: email || undefined };
      const c = await api<{ id: string }>("/clients", { method: "POST", body: JSON.stringify(body) });
      onAdded(c.id);
    } catch (e) { setErr(e instanceof ApiError ? e.message : "خطأ"); setSaving(false); }
  }

  const field = (label: string, val: string, set: (v: string) => void, opts: { type?: string } = {}) => (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-medium text-muted">{label}</span>
      <input type={opts.type ?? "text"} value={val} onChange={(e) => set(e.target.value)}
        className="h-9 w-full rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30" />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-md rounded-card border border-line bg-card p-5 shadow-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-[15px] font-bold text-ink"><UserPlus size={17} className="text-primary" /> {t("addClientQuick")}</h2>
          <button onClick={onClose} className="text-subtle hover:text-ink"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <span className="mb-1 block text-[11.5px] font-medium text-muted">{t("clientType")}</span>
            <div className="flex gap-2">
              {(["CORPORATE", "INDIVIDUAL"] as const).map((tp) => (
                <button key={tp} type="button" onClick={() => setType(tp)}
                  className={`h-9 flex-1 rounded-lg border text-[12.5px] font-semibold ${type === tp ? "border-primary bg-primary/10 text-primary" : "border-line bg-card text-subtle"}`}>
                  {tp === "CORPORATE" ? t("corporate") : t("individual")}
                </button>
              ))}
            </div>
          </div>
          {field(t("clientName"), name, setName)}
          {field(type === "CORPORATE" ? t("crNumber") : t("nationalId"), ident, setIdent)}
          <div className="grid grid-cols-2 gap-3">
            {field(t("phone"), phone, setPhone)}
            {field(t("email"), email, setEmail, { type: "email" })}
          </div>
          {err ? <p className="text-[12px] font-medium text-danger">{err}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="h-9 rounded-lg border border-line px-3 text-[12.5px] font-medium text-muted hover:bg-surface-2">{t("cancel")}</button>
            <button onClick={save} disabled={saving} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-strong px-4 text-[12.5px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60">
              <Check size={15} /> {saving ? "…" : t("save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
