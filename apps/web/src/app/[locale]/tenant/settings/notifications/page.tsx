"use client";

import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { NotificationManager, type NotifSetting } from "@/components/notifications/NotificationManager";

/** إشعارات الشركة (مالك الحساب) — تخصيص نصوص/قنوات فوق افتراضي المنصة. */
export default function TenantNotificationsPage() {
  const t = useTranslations("notif");
  return (
    <NotificationManager
      subtitle={t("subtitleTenant")}
      load={() => api<NotifSetting[]>("/notifications")}
      save={(key, dto) => api(`/notifications/${key}`, { method: "PUT", body: JSON.stringify(dto) }).then(() => undefined)}
    />
  );
}
