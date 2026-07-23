"use client";

import { useEffect, useState } from "react";
import { FileText, UserPlus, ListTodo, Handshake, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { api, getToken } from "@/lib/api";
import { Link } from "@/i18n/routing";

type Perms = Record<string, { create?: boolean }>;

// إجراءات سريعة — كل زر يقفز مباشرةً لسطح الإنشاء (طلب/عميل/مهمة/صفقة). محكوم بصلاحية الإنشاء للموديول.
const ACTIONS = [
  { key: "newRequest", href: "/tenant/requests/new", Icon: FileText, module: "sales" },
  { key: "newClient", href: "/tenant/clients#new", Icon: UserPlus, module: "clients" },
  { key: "newTask", href: "/tenant/crm#new-task", Icon: ListTodo, module: "sales" },
  { key: "newDeal", href: "/tenant/crm#new-deal", Icon: Handshake, module: "sales" },
] as const;

/** مربّع الاختصارات السريعة على لوحة التحكّم — إجراءات الإنشاء الأكثر تكرارًا بنقرة واحدة. */
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
    <section className="rounded-card border border-line bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2">
        <Zap size={16} className="text-primary" />
        <h2 className="text-[13.5px] font-bold text-ink">{t("title")}</h2>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {shown.map((a) => (
          <Link
            key={a.key}
            href={a.href}
            className="group flex flex-col items-center gap-2 rounded-xl border border-line bg-surface-2/40 px-3 py-3.5 text-center transition-colors hover:border-primary/40 hover:bg-primary-soft/50"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary transition-transform group-hover:scale-110">
              <a.Icon size={19} />
            </span>
            <span className="text-[12.5px] font-semibold leading-tight text-ink">{t(a.key)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
