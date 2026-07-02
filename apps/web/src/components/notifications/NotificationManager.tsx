"use client";

import { useCallback, useEffect, useState } from "react";
import { Save, Check, Bell } from "lucide-react";
import { useTranslations } from "next-intl";

export interface NotifSetting {
  eventKey: string;
  name: string;
  channelEmail: boolean;
  channelSms: boolean;
  subject: string | null;
  body: string;
  source: "custom" | "inherited" | "default";
}

/** لوحة إدارة الإشعارات المشتركة — يوفّر الأب دوالّ الجلب والحفظ (papi/api). */
export function NotificationManager({
  load,
  save,
  subtitle,
}: {
  load: () => Promise<NotifSetting[]>;
  save: (key: string, dto: { channelEmail: boolean; channelSms: boolean; subject: string; body: string }) => Promise<void>;
  subtitle: string;
}) {
  const t = useTranslations("notif");
  const [rows, setRows] = useState<NotifSetting[]>([]);
  const [drafts, setDrafts] = useState<Record<string, NotifSetting>>({});
  const [savedKey, setSavedKey] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const list = await load();
    setRows(list);
    setDrafts(Object.fromEntries(list.map((r) => [r.eventKey, r])));
  }, [load]);
  useEffect(() => { void refresh().catch(() => setError(t("error"))); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (key: string, p: Partial<NotifSetting>) => setDrafts((d) => ({ ...d, [key]: { ...d[key], ...p } }));

  async function onSave(key: string) {
    setError(""); setSavedKey("");
    const d = drafts[key];
    try {
      await save(key, { channelEmail: d.channelEmail, channelSms: d.channelSms, subject: d.subject ?? "", body: d.body });
      setSavedKey(key);
      await refresh();
    } catch (e) { setError((e as Error).message || t("error")); }
  }

  const tone = { custom: "bg-primary/10 text-primary", inherited: "bg-warning/10 text-warning", default: "bg-surface-2 text-subtle" };
  const label = { custom: t("sourceCustom"), inherited: t("sourceInherited"), default: t("sourceDefault") };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Bell size={20} /></div>
        <div><h1 className="text-lg font-bold text-ink">{t("title")}</h1><p className="text-[12.5px] text-subtle">{subtitle}</p></div>
      </header>
      {error ? <p className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p> : null}

      <div className="space-y-3">
        {rows.map((r) => {
          const d = drafts[r.eventKey] ?? r;
          return (
            <section key={r.eventKey} className="rounded-card border border-line bg-card p-4">
              <div className="mb-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[13.5px] font-bold text-ink">{r.name}</span>
                  <span className={["rounded-full px-2 py-0.5 text-[11px] font-medium", tone[r.source]].join(" ")}>{label[r.source]}</span>
                </div>
                <div className="flex items-center gap-3 text-[12.5px]">
                  <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={d.channelEmail} onChange={(e) => patch(r.eventKey, { channelEmail: e.target.checked })} /> {t("email")}</label>
                  <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={d.channelSms} onChange={(e) => patch(r.eventKey, { channelSms: e.target.checked })} /> {t("sms")}</label>
                </div>
              </div>
              <textarea value={d.body} onChange={(e) => patch(r.eventKey, { body: e.target.value })} rows={2}
                className="w-full rounded-lg border border-line bg-card px-3 py-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30" />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] text-subtle">{t("vars")}</span>
                <button onClick={() => onSave(r.eventKey)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3 text-[12px] font-semibold text-white hover:opacity-90">
                  {savedKey === r.eventKey ? <Check size={14} /> : <Save size={14} />} {savedKey === r.eventKey ? t("saved") : t("save")}
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
