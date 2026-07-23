/**
 * الصيغة الافتراضية لطلب العرض (RFQ) — بعناصر نائبة تُستبدَل وقت الإرسال:
 * {client} العميل · {line} فرع التأمين · {period} مدة التغطية · {ref} رقم المرجع · {company} اسم شركة الوساطة.
 * تُستخدَم إن لم يحفظ المستأجر قالبًا مخصّصًا في الإعدادات.
 */
export const RFQ_PLACEHOLDERS = ["client", "line", "period", "ref", "company"] as const;

export const RFQ_DEFAULT_SUBJECT = "طلب عرض سعر — {client} — {line} ({ref})";

export const RFQ_DEFAULT_BODY = [
  "السلام عليكم ورحمة الله وبركاته،",
  "",
  "نأمل تزويدنا بعرض سعر للتغطية التالية:",
  "• العميل: {client}",
  "• فرع التأمين: {line}",
  "• مدة التغطية: {period}",
  "• رقم المرجع: {ref}",
  "",
  "نرجو موافاتنا بأفضل الشروط والأسعار في أقرب وقت ممكن. وللاستفسار يُرجى الرد على هذا البريد مباشرةً.",
  "",
  "مع خالص التقدير،",
  "{company}",
].join("\n");

/** يستبدل العناصر النائبة بقيمها الفعلية للـslip. */
export function fillRfqPlaceholders(template: string, vars: Record<(typeof RFQ_PLACEHOLDERS)[number], string>): string {
  return template.replace(/\{(client|line|period|ref|company)\}/g, (_, k: keyof typeof vars) => vars[k] ?? "");
}
