import { redirect } from "next/navigation";

export default function AdminHome({ params: { locale } }: { params: { locale: string } }) {
  redirect(`/${locale}/admin/usage`);
}
