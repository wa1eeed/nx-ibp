"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Check } from "lucide-react";
import { useTranslations } from "next-intl";

interface Notif {
  id: string;
  eventKey: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

interface BellProps {
  /** دالة نداء الـ API المناسبة للنطاق (api للموظف · cpapi لبوّابة العميل). */
  apiFn: <T = unknown>(path: string, opts?: RequestInit) => Promise<T>;
  /** هل يوجد توكن صالح (لتجنّب النداء قبل الدخول). */
  hasToken: () => boolean;
  /** مسار الصندوق: `/notifications/inbox` (موظف) · `/portal/notifications` (عميل). */
  basePath: string;
  /** إظهار زر «تعليم الكل كمقروء» (متاح للموظف؛ غير مُتاح للبوّابة). */
  allowMarkAll?: boolean;
}

/** جرس الإشعارات داخل المنصة (in-app) — شارة غير المقروء + قائمة منسدلة + تعليم كمقروء. مُعمَّم لأي نطاق. */
export function NotificationBell({ apiFn, hasToken, basePath, allowMarkAll = true }: BellProps) {
  const t = useTranslations("notifCenter");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const loadCount = useCallback(async () => {
    if (!hasToken()) return;
    try {
      const r = await apiFn<{ count: number }>(`${basePath}/unread-count`);
      setUnread(r.count);
    } catch { /* تجاهل */ }
  }, [apiFn, hasToken, basePath]);

  const loadItems = useCallback(async () => {
    try { setItems(await apiFn<Notif[]>(basePath)); } catch { /* تجاهل */ }
  }, [apiFn, basePath]);

  useEffect(() => {
    void loadCount();
    const id = setInterval(() => void loadCount(), 30000);
    return () => clearInterval(id);
  }, [loadCount]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) await loadItems();
  }

  async function markRead(id: string) {
    try {
      await apiFn(`${basePath}/${id}/read`, { method: "POST" });
      setItems((x) => x.map((i) => (i.id === id ? { ...i, readAt: new Date().toISOString() } : i)));
      setUnread((u) => Math.max(0, u - 1));
    } catch { /* تجاهل */ }
  }

  async function markAll() {
    try {
      await apiFn(`${basePath}/read-all`, { method: "POST" });
      setItems((x) => x.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })));
      setUnread(0);
    } catch { /* تجاهل */ }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => void toggle()}
        className="relative grid h-9 w-9 place-items-center rounded-lg border border-line bg-card text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        aria-label={t("title")}
      >
        <Bell size={17} />
        {unread > 0 ? (
          <span className="absolute -end-1 -top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white ring-2 ring-card">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute end-0 top-full z-20 mt-1.5 w-80 overflow-hidden rounded-xl border border-line bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="text-[13px] font-semibold text-ink">{t("title")}</span>
            {allowMarkAll && unread > 0 ? (
              <button type="button" onClick={() => void markAll()} className="inline-flex items-center gap-1 text-[11.5px] font-medium text-primary hover:underline">
                <Check size={12} /> {t("markAll")}
              </button>
            ) : null}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-[12.5px] text-subtle">{t("empty")}</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => (n.readAt ? undefined : void markRead(n.id))}
                  className={["flex w-full flex-col items-start gap-0.5 border-b border-line px-4 py-2.5 text-start transition-colors hover:bg-surface-2", n.readAt ? "" : "bg-primary/5"].join(" ")}
                >
                  <span className="flex w-full items-center gap-2">
                    {!n.readAt ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /> : null}
                    <span className="text-[12.5px] font-semibold text-ink">{n.title}</span>
                  </span>
                  <span className="text-[11.5px] text-subtle">{n.body}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
