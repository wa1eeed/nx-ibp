/**
 * أنواع الإشعارات ونصوصها الافتراضية. متغيّرات النص بين أقواس مثل {sequenceNo}.
 *
 * بُعدان:
 *  - `audience`: **client** (يُرسَل لعميل شركة الوساطة عبر email/sms) أو **staff**
 *    (يُرسَل لموظفي/مستخدمي شركة الوساطة عبر البريد — لا هاتف للمستخدمين).
 *  - `module`: لإشعارات الموظفين فقط — يحدّد مستقبِليها (أصحاب صلاحية هذه الوحدة + مالك الحساب).
 *
 * كل نوع قابل للتفعيل/التعطيل وتعديل نصّه على مستويين: افتراضي المنصة (سوبر أدمن) وتخصيص الشركة.
 */
import type { RbacModule } from "../rbac/rbac.constants";

export interface NotificationTypeDef {
  key: string;
  audience: "client" | "staff";
  module: RbacModule | null; // وحدة التوجيه لإشعارات الموظفين (null لإشعارات العملاء)
  name: string;
  subject: string;
  body: string;
  subjectEn?: string; // النصّ الإنجليزي (ثنائية اللغة — يُختار حسب لغة المستقبِل)
  bodyEn?: string;
  email: boolean;
  sms: boolean;
}

export const NOTIFICATION_TYPES: readonly NotificationTypeDef[] = [
  // ————————————————— إشعارات العملاء —————————————————
  { key: "welcome", audience: "client", module: null, name: "ترحيب بالعميل", subject: "مرحبًا بك", body: "شكرًا لاختيارك وسيطك للتأمين. مدير حسابك جاهز لخدمتك في أي استفسار.", subjectEn: "Welcome", bodyEn: "Thank you for choosing your insurance broker. Your account manager is ready to help with any inquiry.", email: true, sms: false },
  { key: "policy_issued", audience: "client", module: null, name: "إصدار وثيقة", subject: "تم إصدار وثيقتك", body: "تم إصدار وثيقتك رقم {sequenceNo}. تجدها في حسابك على المنصة.", subjectEn: "Your policy has been issued", bodyEn: "Your policy no. {sequenceNo} has been issued. You can find it in your account.", email: true, sms: true },
  { key: "debit_note", audience: "client", module: null, name: "إشعار مدين", subject: "إشعار مدين", body: "يرجى سداد قسط الوثيقة {ref} خلال 7 أيام من تاريخه.", subjectEn: "Debit note", bodyEn: "Please settle the premium for policy {ref} within 7 days.", email: true, sms: true },
  { key: "tax_invoice", audience: "client", module: null, name: "فاتورة ضريبية", subject: "فاتورة ضريبية", body: "أُصدرت فاتورة ضريبية متعلّقة بوثيقتك {ref}.", subjectEn: "Tax invoice", bodyEn: "A tax invoice has been issued for your policy {ref}.", email: true, sms: false },
  { key: "request_ack", audience: "client", module: null, name: "استلام طلب خدمة", subject: "استلمنا طلبك", body: "استلمنا طلبك رقم {ref} ونعمل على معالجته.", subjectEn: "We received your request", bodyEn: "We received your request no. {ref} and are working on it.", email: true, sms: true },
  { key: "claim_ack", audience: "client", module: null, name: "استلام مطالبة", subject: "استلمنا مطالبتك", body: "استلمنا مطالبتك رقم {ref} وسنوافيك بالمستجدّات.", subjectEn: "We received your claim", bodyEn: "We received your claim no. {ref} and will keep you updated.", email: true, sms: true },
  { key: "renewal_reminder", audience: "client", module: null, name: "تذكير تجديد", subject: "تذكير بتجديد وثيقتك", body: "تقترب وثيقتك {ref} من الانتهاء. تواصل معنا للتجديد.", subjectEn: "Policy renewal reminder", bodyEn: "Your policy {ref} is approaching expiry. Contact us to renew.", email: true, sms: true },

  // ————————————————— إشعارات الموظفين (داخلية) —————————————————
  { key: "staff_request_created", audience: "staff", module: "production", name: "طلب تأمين جديد", subject: "طلب تأمين جديد", body: "طلب تأمين جديد رقم {ref} بانتظار التسعير.", subjectEn: "New insurance request", bodyEn: "New insurance request no. {ref} awaiting pricing.", email: true, sms: false },
  { key: "staff_quotation_added", audience: "staff", module: "production", name: "عرض سعر جديد", subject: "عرض سعر جديد", body: "أُضيف عرض سعر من {insurer} على الطلب {ref}.", subjectEn: "New quotation", bodyEn: "A quotation from {insurer} was added to request {ref}.", email: true, sms: false },
  { key: "staff_policy_technical_review", audience: "staff", module: "production", name: "وثيقة بانتظار الموافقة الفنية", subject: "بانتظار الموافقة الفنية", body: "الوثيقة {sequenceNo} أُصدرت وتنتظر الموافقة الفنية.", subjectEn: "Awaiting technical approval", bodyEn: "Policy {sequenceNo} was issued and awaits technical approval.", email: true, sms: false },
  { key: "staff_policy_finance_review", audience: "staff", module: "finance", name: "وثيقة بانتظار الاعتماد المالي", subject: "بانتظار الاعتماد المالي", body: "الوثيقة {sequenceNo} اجتازت الموافقة الفنية وتنتظر الاعتماد المالي.", subjectEn: "Awaiting financial approval", bodyEn: "Policy {sequenceNo} passed technical approval and awaits financial approval.", email: true, sms: false },
  { key: "staff_policy_issued", audience: "staff", module: "production", name: "تم إصدار وثيقة (داخلي)", subject: "اكتمل إصدار وثيقة", body: "اكتمل اعتماد وإصدار الوثيقة {sequenceNo}.", subjectEn: "Policy issued", bodyEn: "Policy {sequenceNo} has been approved and issued.", email: true, sms: false },
  { key: "staff_claim_created", audience: "staff", module: "claims", name: "مطالبة جديدة", subject: "مطالبة جديدة", body: "مطالبة جديدة رقم {ref} بانتظار المعالجة.", subjectEn: "New claim", bodyEn: "New claim no. {ref} awaiting processing.", email: true, sms: false },
  { key: "staff_renewal_due", audience: "staff", module: "renewals", name: "تجديد مستحق", subject: "تجديد مستحق", body: "بدأ إجراء تجديد الوثيقة {ref}.", subjectEn: "Renewal due", bodyEn: "Renewal process started for policy {ref}.", email: true, sms: false },
  { key: "staff_verification_result", audience: "staff", module: "compliance", name: "نتيجة تحقّق حكومي", subject: "نتيجة تحقّق", body: "نتيجة التحقّق ({subject}): {result}.", subjectEn: "Verification result", bodyEn: "Verification result ({subject}): {result}.", email: true, sms: false },
  { key: "staff_wallet_low", audience: "staff", module: "finance", name: "رصيد محفظة التحقق منخفض", subject: "تنبيه رصيد المحفظة", body: "رصيد محفظة التحقق منخفض ({balance}). يُرجى إعادة الشحن لتفادي توقّف عمليات التحقق.", subjectEn: "Verification wallet low", bodyEn: "Verification wallet balance is low ({balance}). Please top up to avoid interruptions.", email: true, sms: false },
  { key: "staff_member_added", audience: "staff", module: "settings", name: "إضافة مستخدم جديد", subject: "مستخدم جديد", body: "أُضيف مستخدم جديد للحساب: {name} ({role}).", subjectEn: "New user added", bodyEn: "A new user was added to the account: {name} ({role}).", email: true, sms: false },
  { key: "staff_subscription_status", audience: "staff", module: "settings", name: "تحديث حالة الاشتراك", subject: "تحديث الاشتراك", body: "تحديث حالة اشتراك الحساب: {status}.", subjectEn: "Subscription update", bodyEn: "Account subscription status update: {status}.", email: true, sms: false },
  { key: "staff_task_assigned", audience: "staff", module: "sales", name: "إسناد مهمة", subject: "مهمة جديدة مُسنَدة إليك", body: "أُسنِدت إليك مهمة: {title}.", subjectEn: "New task assigned to you", bodyEn: "A task has been assigned to you: {title}.", email: true, sms: false },
  { key: "staff_deal_assigned", audience: "staff", module: "sales", name: "إسناد صفقة (CRM)", subject: "صفقة مُسنَدة إليك", body: "أُسنِدت إليك صفقة: {title}.", subjectEn: "Deal assigned to you", bodyEn: "A deal has been assigned to you: {title}.", email: true, sms: false },
  { key: "staff_task_due", audience: "staff", module: "sales", name: "مهمة مستحقّة", subject: "لديك مهمة مستحقّة", body: "المهمة «{title}» بلغت تاريخ استحقاقها ({dueDate}).", subjectEn: "You have a task due", bodyEn: "Task “{title}” has reached its due date ({dueDate}).", email: true, sms: false },
  { key: "staff_service_assigned", audience: "staff", module: "service", name: "إسناد طلب خدمة", subject: "طلب خدمة مُسنَد إليك", body: "أُسنِد إليك طلب خدمة {ref}: {subject}.", subjectEn: "Service request assigned to you", bodyEn: "Service request {ref} was assigned to you: {subject}.", email: true, sms: false },
] as const;

export const NOTIFICATION_KEYS = NOTIFICATION_TYPES.map((t) => t.key);
export type NotificationKey = (typeof NOTIFICATION_TYPES)[number]["key"];
export const isNotificationKey = (k: string): boolean => (NOTIFICATION_KEYS as readonly string[]).includes(k);
export const notificationDef = (key: string): NotificationTypeDef | undefined => NOTIFICATION_TYPES.find((t) => t.key === key);
