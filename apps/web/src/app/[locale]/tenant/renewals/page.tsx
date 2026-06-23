import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Placeholder } from "@/components/ui/Placeholder";

export default function RenewalsPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  const t = useTranslations();
  return (
    <div>
      <PageHeader title={t("nav.renewals")} />
      <Placeholder title={t("placeholder.title")} body={t("placeholder.body")} />
    </div>
  );
}
