/**
 * إخفاء البيانات الحسّاسة (DLP) — إظهار جزئي لأقلّ امتياز.
 * الهوية الوطنية/الإقامة والآيبان تُخفى لغير المخوّلين (يبقى آخر 4 خانات للمطابقة).
 * قاعدة: لا نُظهر PII كاملًا لمن لا يحتاجه وظيفيًّا (الالتزام/المالية فقط يرونه كاملًا).
 */
const DOT = "•";

/** يُخفي الهوية/الإقامة تاركًا آخر 4 خانات: 10•••••7890. */
export function maskNationalId(v: string | null | undefined): string | null {
  if (!v) return v ?? null;
  const s = String(v).trim();
  if (s.length <= 4) return DOT.repeat(s.length);
  return s.slice(0, 2) + DOT.repeat(Math.max(0, s.length - 6)) + s.slice(-4);
}

/** يُخفي الآيبان تاركًا البادئة (SA + بنك) وآخر 4: SA03••••••••••1234. */
export function maskIban(v: string | null | undefined): string | null {
  if (!v) return v ?? null;
  const s = String(v).replace(/\s/g, "");
  if (s.length <= 8) return s.slice(0, 2) + DOT.repeat(Math.max(0, s.length - 2));
  return s.slice(0, 4) + DOT.repeat(s.length - 8) + s.slice(-4);
}

/** يُطبّق الإخفاء على حقول العميل الحسّاسة الموجودة إن لم يكن المستخدم مخوّلًا. */
export function maskClientSensitive<T extends { nationalId?: string | null; iban?: string | null }>(
  client: T,
  canViewSensitive: boolean,
): T {
  if (canViewSensitive || !client) return client;
  const out = { ...client };
  if ("nationalId" in out) out.nationalId = maskNationalId(out.nationalId);
  if ("iban" in out) out.iban = maskIban(out.iban);
  return out;
}
