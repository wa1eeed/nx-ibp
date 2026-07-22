"use client";

import { useCallback, useEffect, useState } from "react";
import { Shield, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";

interface PrefRole { id: string; name: string; isPreset: boolean }
interface PrefType { key: string; name: string; module: string | null }
interface Muted { roleId: string; eventKey: string }
interface Prefs { roles: PrefRole[]; types: PrefType[]; muted: Muted[] }

const cell = (roleId: string, eventKey: string) => `${roleId}::${eventKey}`;

/**
 * §9.1 — مصفوفة توجيه إشعارات الموظفين حسب الدور. الصفوف = أنواع إشعارات الموظفين،
 * الأعمدة = أدوار الشركة. الخلية مُحدَّدة = الدور يستقبل النوع (opt-out: الكتم يُلغي التحديد).
 * الحفظ فوري لكل تبديل (PUT /notifications/preferences).
 */
export function RoleNotificationMatrix() {
  const t = useTranslations("notif");
  const [data, setData] = useState<Prefs | null>(null);
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [savedCell, setSavedCell] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    const p = await api<Prefs>("/notifications/preferences");
    setData(p);
    setMuted(new Set(p.muted.map((m) => cell(m.roleId, m.eventKey))));
  }, []);
  useEffect(() => { void refresh().catch(() => setError(t("roleMatrix.error"))); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const modLabel = (m: string | null) => (m ? t(`mod.${m}` as never) : "");

  async function toggle(roleId: string, eventKey: string, nextEnabled: boolean) {
    const key = cell(roleId, eventKey);
    setError(""); setSavedCell("");
    setBusy((b) => new Set(b).add(key));
    // تحديث تفاؤلي
    setMuted((s) => { const n = new Set(s); if (nextEnabled) n.delete(key); else n.add(key); return n; });
    try {
      await api("/notifications/preferences", { method: "PUT", body: JSON.stringify({ roleId, eventKey, enabled: nextEnabled }) });
      setSavedCell(key);
      setTimeout(() => setSavedCell((c) => (c === key ? "" : c)), 1200);
    } catch (e) {
      // تراجُع عند الفشل
      setMuted((s) => { const n = new Set(s); if (nextEnabled) n.add(key); else n.delete(key); return n; });
      setError((e as Error).message || t("roleMatrix.error"));
    } finally {
      setBusy((b) => { const n = new Set(b); n.delete(key); return n; });
    }
  }

  if (!data) return null;

  return (
    <section className="rounded-card border border-line bg-card p-4">
      <div className="mb-1 flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><Shield size={16} /></div>
        <h2 className="text-[13.5px] font-bold text-ink">{t("roleMatrix.title")}</h2>
      </div>
      <p className="mb-1 text-[12px] text-subtle">{t("roleMatrix.subtitle")}</p>
      <p className="mb-1.5 text-[11.5px] text-subtle">{t("roleMatrix.hint")}</p>
      {/* توضيح القنوات: أين تصل هذه الإشعارات */}
      <p className="mb-3 rounded-lg bg-primary-soft/50 px-3 py-2 text-[11.5px] text-primary-strong">{t("roleMatrix.channels")}</p>
      {error ? <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-[12px] font-medium text-danger">{error}</p> : null}

      {/* حاوية بارتفاع محدود وتمرير داخلي كي يبقى رأس الجدول (الأدوار) ظاهرًا حتى آخر الصفوف */}
      <div className="max-h-[65vh] overflow-auto rounded-lg border border-line">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-line">
              <th className="sticky start-0 top-0 z-30 border-b border-line bg-card py-2 pe-3 ps-2 text-start font-bold text-ink">{t("roleMatrix.typeCol")}</th>
              {data.roles.map((r) => (
                <th key={r.id} className="sticky top-0 z-20 border-b border-line bg-card px-2 py-2 text-center align-bottom font-semibold text-subtle">
                  <span className="inline-block max-w-[92px] truncate" title={r.name}>{r.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.types.map((ty) => (
              <tr key={ty.key} className="border-b border-line/60 last:border-0 hover:bg-surface-2/40">
                <td className="sticky start-0 z-10 bg-card py-2 pe-3">
                  <div className="font-medium text-ink">{ty.name}</div>
                  {ty.module ? <span className="mt-0.5 inline-block rounded-full bg-surface-2 px-1.5 py-0.5 text-[10.5px] text-subtle">{modLabel(ty.module)}</span> : null}
                </td>
                {data.roles.map((r) => {
                  const key = cell(r.id, ty.key);
                  const enabled = !muted.has(key);
                  return (
                    <td key={r.id} className="px-2 py-2 text-center">
                      <label className="relative inline-flex cursor-pointer items-center justify-center">
                        <input
                          type="checkbox"
                          className="peer h-4 w-4 cursor-pointer accent-primary disabled:cursor-wait"
                          checked={enabled}
                          disabled={busy.has(key)}
                          onChange={(e) => void toggle(r.id, ty.key, e.target.checked)}
                        />
                        {savedCell === key ? <Check size={12} className="pointer-events-none absolute -end-3 text-success" /> : null}
                      </label>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
