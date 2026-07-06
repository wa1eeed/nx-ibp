"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

export const PAGE_SIZE = 50;

/**
 * ترقيم صفحات على جانب العميل: يقسّم مصفوفة إلى صفحات (50 عنصرًا افتراضيًا).
 * يُعيد عناصر الصفحة الحالية + بيانات العرض. يُثبّت الصفحة ضمن الحدود عند تغيّر البيانات.
 */
export function usePaged<T>(items: T[], size: number = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * size;
  const pageItems = useMemo(() => items.slice(start, start + size), [items, start, size]);
  return {
    pageItems,
    page: current,
    setPage,
    pageCount,
    total,
    size,
    from: total ? start + 1 : 0,
    to: Math.min(start + size, total),
  };
}

/**
 * شريط ترقيم أسفل الجدول — يظهر فقط عند تجاوز البيانات حجم الصفحة (50). RTL-aware.
 */
export function Pagination({
  page,
  pageCount,
  total,
  from,
  to,
  size = PAGE_SIZE,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  from: number;
  to: number;
  size?: number;
  onPage: (p: number) => void;
}) {
  const t = useTranslations("pagination");
  if (total <= size) return null; // لا حاجة للترقيم إذا كانت البيانات ضمن صفحة واحدة

  const btn =
    "inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-card px-2.5 text-[12px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-card disabled:hover:text-muted";

  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
      <span className="text-[12px] text-subtle tnum">{t("showing", { from, to, total })}</span>
      <div className="flex items-center gap-1.5">
        <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronRight size={14} /> {t("prev")}
        </button>
        <span className="px-1.5 text-[12px] font-medium text-muted tnum">{t("page", { page, pages: pageCount })}</span>
        <button type="button" className={btn} disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
          {t("next")} <ChevronLeft size={14} />
        </button>
      </div>
    </div>
  );
}
