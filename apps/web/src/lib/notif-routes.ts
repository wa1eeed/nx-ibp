/**
 * خريطة توجيه الإشعارات: نوع الحدث (eventKey) ⇒ وجهة داخل المنصة.
 * تُستخدم في جرس الإشعارات لنقل المستخدم لمكان العمل ذي الصلة عند النقر
 * (مثلاً: إشعار مهمة CRM ⇒ قائمة المهام) — أفضل تجربة مستخدم.
 * إرجاع null = لا وجهة (يُعلَّم كمقروء فقط).
 */

/** إشعارات الموظف/الأدمن داخل لوحة الشركة. */
const STAFF_ROUTES: Record<string, string> = {
  // المبيعات / إدارة علاقات العملاء (CRM)
  staff_task_assigned: "/tenant/crm",
  staff_task_due: "/tenant/crm",
  staff_deal_assigned: "/tenant/crm",
  // الطلبات وعروض الأسعار
  staff_request_created: "/tenant/requests",
  staff_quotation_added: "/tenant/requests",
  // الوثائق وسلسلة الاعتماد
  staff_policy_technical_review: "/tenant/policies",
  staff_policy_finance_review: "/tenant/policies",
  staff_policy_issued: "/tenant/policies",
  // المطالبات والتجديدات والخدمة
  staff_claim_created: "/tenant/claims",
  staff_claim_reply: "/tenant/claims",
  staff_renewal_due: "/tenant/renewals",
  staff_service_assigned: "/tenant/service",
  staff_service_reply: "/tenant/service",
  // التحقّق الحكومي ومحفظته
  staff_verification_result: "/tenant/verification",
  staff_wallet_low: "/tenant/verification",
  // الإعدادات
  staff_member_added: "/tenant/settings/staff",
  staff_subscription_status: "/tenant/settings/billing",
};

/** إشعارات العميل داخل بوّابة العميل. */
const CLIENT_ROUTES: Record<string, string> = {
  policy_issued: "/portal/policies",
  renewal_reminder: "/portal/policies",
  debit_note: "/portal/statement",
  tax_invoice: "/portal/statement",
  request_ack: "/portal/requests",
  service_reply: "/portal/requests",
  claim_ack: "/portal/claims",
  claim_reply: "/portal/claims",
};

export const staffNotifRoute = (eventKey: string): string | null => STAFF_ROUTES[eventKey] ?? null;
export const clientNotifRoute = (eventKey: string): string | null => CLIENT_ROUTES[eventKey] ?? null;
