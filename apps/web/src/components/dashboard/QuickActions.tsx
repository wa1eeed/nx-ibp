"use client";

import { useEffect, useState } from "react";
import { FileText, UserPlus, ListTodo, Handshake, Zap, ArrowUpLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { api, getToken } from "@/lib/api";
import { Link } from "@/i18n/routing";

type Perms = Record<string, { create?: boolean }>;

// إجراءات سريعة — كل زر يقفز مباشرةً لسطح الإنشاء (طلب/عميل/مهمة/صفقة). محكوم بصلاحية الإنشاء للموديول.
// لكلٍّ لون تمييزي (accent) وتدرّج خاصّ لهويّة بصرية احترافية.
const ACTIONS = [
  { key: "newRequest", href: "/tenant/requests/new", Icon: FileText, module: "sales", tone: "text-primary", chip: "from-primary/20 to-primary/5", ring: "hover:border-primary/40" },
  { key: "newClient", href: "/tenant/clients#new", Icon: UserPlus, module: "clients", tone: "text-info", chip: "from-info/20 to-info/5", ring: "hover:border-info/40" },
  { key: "newTask", href: "/tenant/crm#new-task", Icon: ListTodo, module: "sales", tone: "text-warning", chip: "from-warning/20 to-warning/5", ring: "hover:border-warning/40" },
  { key: "newDeal", href: "/tenant/crm#new-deal", Icon: Handshake, module: "sales", tone: "text-success", chip: "from-success/20 to-success/5", ring: "hover:border-success/40" },
] as const;

/** مربّع الاختصارات السريعة على لوحة التحكّم — إجراءات الإنشاء الأكثر تكرارًا ببطاقات مصمَّمة. */
export function QuickActions() {
  const t = useTranslations("quickActions");
  const [perms, setPerms] = useState<Perms | null>(null);
  useEffect(() => {
    if (!getToken()) return;
    void api<{ permissions?: Perms }>("/auth/me").then((m) => setPerms(m.permissions ?? {})).catch(() => setPerms({}));
  }, []);

  const shown = perms === null ? [] : ACTIONS.filter((a) => perms[a.module]?.create);
  if (perms === null || !shown.length) return null;

  return (
    <section className="relative overflow-hidden rounded-card border border-line bg-card p-4 shadow-card">
      {/* توهّج خفيف في الزاوية */}
      <div className="pointer-events-none absolute -end-16 -top-16 h-40 w-40 rounded-full bg-primary/5 blur-2xl" aria-hidden />
      <div className="relative mb-3 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-white shadow-sm"><Zap size={15} /></span>
        <h2 className="text-[13.5px] font-bold text-ink">{t("title")}</h2>
      </div>
      <div className="relative grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {shown.map((a) => (
          <Link
            key={a.key}
            href={a.href}
            className={`group relative flex items-center gap-3 overflow-hidden rounded-xl border border-line bg-surface-2/30 p-3 transition-all duration-300 hover:-translate-y-0.5 hover:bg-card hover:shadow-lg ${a.ring}`}
          >
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${a.chip} ${a.tone} transition-transform duration-300 group-hover:scale-110`}>
              <a.Icon size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-bold leading-tight text-ink">{t(a.key)}</span>
              <span className="mt-0.5 block truncate text-[10.5px] leading-tight text-subtle">{t(`sub.${a.key}`)}</span>
            </span>
            <ArrowUpLeft size={15} className={`shrink-0 ${a.tone} opacity-0 transition-opacity duration-300 group-hover:opacity-100 ltr:rotate-90`} aria-hidden />
          </Link>
        ))}
      </div>
    </section>
  );
}
