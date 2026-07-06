import type { ReactNode } from "react";
import { setRequestLocale } from "next-intl/server";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { MobileNavProvider } from "@/components/layout/MobileNavContext";

export default function TenantLayout({
  children,
  params: { locale },
}: {
  children: ReactNode;
  params: { locale: string };
}) {
  setRequestLocale(locale);
  return (
    <MobileNavProvider>
      <div className="flex min-h-screen bg-bg text-ink">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 px-5 py-6 sm:px-7">{children}</main>
        </div>
      </div>
    </MobileNavProvider>
  );
}
