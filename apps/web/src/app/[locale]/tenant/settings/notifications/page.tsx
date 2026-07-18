"use client";

import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { NotificationManager, type NotifSetting } from "@/components/notifications/NotificationManager";
import { RoleNotificationMatrix } from "@/components/notifications/RoleNotificationMatrix";

/** إشعارات الشركة (مالك الحساب) — توجيه حسب الدور (§9.1) + تخصيص نصوص/قنوات فوق افتراضي المنصة. */
export default function TenantNotificationsPage() {
  const t = useTranslations("notif");
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <RoleNotificationMatrix />
      <NotificationManager
        subtitle={t("subtitleTenantAll")}
        load={() => api<NotifSetting[]>("/notifications")}
        save={(key, dto) => api(`/notifications/${key}`, { method: "PUT", body: JSON.stringify(dto) }).then(() => undefined)}
      />
    </div>
  );
}
