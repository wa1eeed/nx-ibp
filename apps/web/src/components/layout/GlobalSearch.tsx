"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Users, FileCheck2, ClipboardList, ShieldAlert, Umbrella, CornerDownLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { useRouter } from "@/i18n/routing";

interface Hit { id: string; title: string; sub: string | null; badge: string | null; href: string }
interface Group { type: string; items: Hit[] }

const ICONS: Record<string, typeof Users> = { client: Users, policy: FileCheck2, request: ClipboardList, claim: ShieldAlert, insurer: Umbrella };

/** بحث عام (⌘K): يستدعي /search بعد إمهال قصير، ويعرض النتائج مجمّعة بالنوع مع تنقّل بالكيبورد. */
export function GlobalSearch() {
  const t = useTranslations();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // قائمة مسطّحة للتنقّل بالكيبورد
  const flat: Hit[] = groups.flatMap((g) => g.items);

  // استدعاء البحث بإمهال 200ms
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setGroups([]); setLoading(false); return; }
    setLoading(true);
    const id = setTimeout(() => {
      void api<{ groups: Group[] }>(`/search?q=${encodeURIComponent(term)}`)
        .then((r) => { setGroups(r.groups); setActive(0); })
        .catch(() => setGroups([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(id);
  }, [q]);

  // ⌘K / Ctrl+K للتركيز
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); inputRef.current?.focus(); setOpen(true); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // إغلاق بالنقر خارجًا
  useEffect(() => {
    function onClick(e: MouseEvent) { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const go = useCallback((href: string) => {
    setOpen(false); setQ(""); setGroups([]);
    inputRef.current?.blur();
    router.push(href);
  }, [router]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); return; }
    if (!flat.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, flat.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const hit = flat[active]; if (hit) go(hit.href); }
  }

  const showPanel = open && q.trim().length >= 2;
  let idx = -1; // فهرس عام عبر المجموعات لتمييز العنصر النشط

  return (
    <div ref={boxRef} className="relative hidden max-w-xl flex-1 sm:block">
      <Search size={16} className="pointer-events-none absolute inset-y-0 my-auto h-4 w-4 text-subtle ltr:left-3 rtl:right-3" />
      <input
        ref={inputRef}
        type="text"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={t("topbar.searchPlaceholder")}
        className="h-9 w-full rounded-full border border-line bg-card text-[13px] text-ink placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-primary/30 ltr:pl-9 ltr:pr-10 rtl:pr-9 rtl:pl-10"
      />
      <kbd className="pointer-events-none absolute inset-y-0 my-auto hidden h-5 items-center rounded border border-line bg-surface-2 px-1.5 text-[10px] font-medium text-subtle ltr:right-3 rtl:left-3 md:flex">⌘K</kbd>

      {showPanel ? (
        <div className="absolute inset-x-0 top-full z-20 mt-1.5 max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-card py-1.5 shadow-card">
          {flat.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12.5px] text-subtle">{loading ? "…" : t("gsearch.empty", { q: q.trim() })}</p>
          ) : (
            groups.map((g) => {
              const Icon = ICONS[g.type] ?? Search;
              return (
                <div key={g.type}>
                  <div className="px-3 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-wider text-subtle">{t(`gsearch.type.${g.type}`)}</div>
                  {g.items.map((hit) => {
                    idx += 1; const isActive = idx === active;
                    return (
                      <button
                        key={hit.id}
                        type="button"
                        onMouseEnter={() => setActive(flat.indexOf(hit))}
                        onClick={() => go(hit.href)}
                        className={`flex w-full items-center gap-2.5 px-3 py-2 text-start transition-colors ${isActive ? "bg-primary-soft/50" : "hover:bg-surface-2"}`}
                      >
                        <Icon size={15} className="shrink-0 text-subtle" />
                        <span className="flex-1 truncate text-[13px] font-medium text-ink tnum">{hit.title}</span>
                        {hit.sub ? <span className="max-w-[40%] truncate text-[11.5px] text-subtle">{hit.sub}</span> : null}
                        {hit.badge ? <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted">{hit.badge}</span> : null}
                        {isActive ? <CornerDownLeft size={12} className="shrink-0 text-primary" /> : null}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
