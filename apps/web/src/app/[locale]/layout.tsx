import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { dirForLocale, type Locale } from "@ibp/shared";
import { routing } from "@/i18n/routing";
import { ConfirmProvider } from "@/components/ui/ConfirmProvider";
import "../globals.css";

export const metadata = {
  metadataBase: new URL("https://ibp.payone.one"),
  title: "IBP — منصة إدارة وساطة التأمين",
  description: "منصة إدارة وساطة التأمين في السعودية — من العميل والاكتتاب إلى إصدار الوثائق والمالية والامتثال",
  // الأيقونة وصورة المشاركة (Open Graph/تويتر) تُلتقَط تلقائيًا من app/icon.svg و app/opengraph-image.tsx
  openGraph: {
    title: "IBP — منصة إدارة وساطة التأمين",
    description: "منصة إدارة وساطة التأمين في السعودية — من العميل والاكتتاب إلى إصدار الوثائق والمالية والامتثال",
    siteName: "IBP",
    type: "website",
    locale: "ar_SA",
  },
  twitter: {
    card: "summary_large_image",
    title: "IBP — منصة إدارة وساطة التأمين",
    description: "منصة إدارة وساطة التأمين في السعودية — من العميل والاكتتاب إلى إصدار الوثائق والمالية والامتثال",
  },
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params: { locale },
}: {
  children: ReactNode;
  params: { locale: string };
}) {
  if (!routing.locales.includes(locale as Locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  const dir = dirForLocale(locale as Locale);

  return (
    <html lang={locale} dir={dir}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>
          <ConfirmProvider>{children}</ConfirmProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
