/** أنواع الإشعارات ونصوصها الافتراضية (متغيّرات النص بين أقواس مثل {sequenceNo}). */
export const NOTIFICATION_TYPES = [
  { key: "welcome", name: "ترحيب بالعميل", subject: "مرحبًا بك", body: "شكرًا لاختيارك وسيطك للتأمين. مدير حسابك جاهز لخدمتك في أي استفسار.", email: true, sms: false },
  { key: "policy_issued", name: "إصدار وثيقة", subject: "تم إصدار وثيقتك", body: "تم إصدار وثيقتك رقم {sequenceNo}. تجدها في حسابك على المنصة.", email: true, sms: true },
  { key: "debit_note", name: "إشعار مدين", subject: "إشعار مدين", body: "يرجى سداد قسط الوثيقة {sequenceNo} خلال 7 أيام من تاريخه.", email: true, sms: true },
  { key: "tax_invoice", name: "فاتورة ضريبية", subject: "فاتورة ضريبية", body: "أُصدرت فاتورة ضريبية متعلّقة بوثيقتك {sequenceNo}.", email: true, sms: false },
  { key: "request_ack", name: "استلام طلب خدمة", subject: "استلمنا طلبك", body: "استلمنا طلبك رقم {ref} ونعمل على معالجته.", email: true, sms: true },
  { key: "claim_ack", name: "استلام مطالبة", subject: "استلمنا مطالبتك", body: "استلمنا مطالبتك رقم {ref} وسنوافيك بالمستجدّات.", email: true, sms: true },
  { key: "renewal_reminder", name: "تذكير تجديد", subject: "تذكير بتجديد وثيقتك", body: "تقترب وثيقتك {sequenceNo} من الانتهاء. تواصل معنا للتجديد.", email: true, sms: true },
] as const;

export const NOTIFICATION_KEYS = NOTIFICATION_TYPES.map((t) => t.key);
export type NotificationKey = (typeof NOTIFICATION_TYPES)[number]["key"];
export const isNotificationKey = (k: string): k is NotificationKey => (NOTIFICATION_KEYS as readonly string[]).includes(k);
