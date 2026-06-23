import { redirect } from "next/navigation";

export default function PortalHome({ params: { locale } }: { params: { locale: string } }) {
  redirect(`/${locale}/portal/dashboard`);
}
