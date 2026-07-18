"use client";

import { useCallback, useEffect, useState } from "react";
import { Printer, ArrowLeft, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { Link } from "@/i18n/routing";
import { CoverNoteDoc, type CoverDoc } from "@/components/documents/CoverNoteDoc";

export default function StaffCoverNotePage({ params }: { params: { id: string } }) {
  const t = useTranslations("coverNoteDoc");
  const [doc, setDoc] = useState<CoverDoc | null>(null);
  const [b, setB] = useState<{ primary: string; displayName: string | null; logoUrl: string | null; logoText: string | null } | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [d, br] = await Promise.all([api<CoverDoc>(`/cover-notes/${params.id}/document`), api<typeof b>("/branding")]);
      setDoc(d); setB(br);
    } catch { setError(t("notFound")); }
  }, [params.id, t]);
  useEffect(() => { void load(); }, [load]);

  if (error) return <div className="mx-auto max-w-lg p-8 text-center text-[13px] text-danger">{error}</div>;
  if (!doc) return <div className="mx-auto max-w-lg p-8 text-center text-[13px] text-subtle">…</div>;

  return (
    <div className="mx-auto max-w-[820px] p-4 print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href="/tenant/slips" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary hover:underline"><ArrowLeft size={15} className="rtl:rotate-180" /> {t("back")}</Link>
        <button onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary-strong px-4 text-[13px] font-semibold text-primary-fg hover:bg-primary"><Printer size={16} /> {t("print")}</button>
      </div>
      <CoverNoteDoc doc={doc} branding={b} icon={<ShieldCheck size={18} />} />
    </div>
  );
}
