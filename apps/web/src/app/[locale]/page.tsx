import { redirect } from "next/navigation";

// الجذر يوجّه إلى لوحة تحكم المستأجر (اللوحة الوحيدة في المرحلة 0).
export default function LocaleHome({
  params: { locale },
}: {
  params: { locale: string };
}) {
  redirect(`/${locale}/tenant/dashboard`);
}
