"use client";

import { useTranslations } from "next-intl";
import { papi } from "@/lib/api";
import { AdminShell } from "@/components/admin/AdminShell";
import { NotificationManager, type NotifSetting } from "@/components/notifications/NotificationManager";

/** إشعارات المنصة الافتراضية (سوبر أدمن المنصة) — يرثها كل الحسابات ما لم تُخصَّص. */
export default function AdminNotificationsPage() {
  const t = useTranslations("notif");
  return (
    <AdminShell>
      <NotificationManager
        subtitle={t("subtitlePlatform")}
        load={() => papi<NotifSetting[]>("/platform/notifications")}
        save={(key, dto) => papi(`/platform/notifications/${key}`, { method: "PUT", body: JSON.stringify(dto) }).then(() => undefined)}
      />
    </AdminShell>
  );
}
