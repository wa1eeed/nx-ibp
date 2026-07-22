/**
 * وصف موحّد لأحداث سجلّ التدقيق (AuditLog) — يحوّل (entity, action) إلى **طور** ملوّن ووصف عربي مقروء.
 * يُستخدَم في سجلّ رحلة الكيان (Lifecycle) ونشاط الموظف والعميل — لتوحيد العرض.
 */

// الطور لكل كيان تدقيق (يقابل ألوان الواجهة)
export const AUDIT_PHASE: Record<string, string> = {
  deal: "crm", deal_convert: "crm", crm_task: "crm", crm_activity: "crm", note: "crm",
  client: "crm", verification: "crm", compliance: "crm",
  request: "request", policy_request: "request",
  slip: "underwriting", slip_rfq_sent: "underwriting", quotation: "underwriting", firm_order: "underwriting", proposal: "underwriting", cover_note: "underwriting",
  policy: "issuance", policy_technical: "issuance", policy_finance: "issuance", policy_approval_step: "issuance", policy_cancellation: "issuance", endorsement: "issuance",
  claim: "service", claim_status: "service", service_request: "service", complaint: "service",
  receipt: "finance", voucher: "finance", credit_note_refund: "finance", commission_receipt: "finance", installment_plan: "finance", debit_note: "finance", credit_note: "finance", invoice: "finance", insurer_settlement: "finance", producer_settlement: "finance", employee_commission_settlement: "finance",
  login: "other", staff: "other",
};

const ENTITY_AR: Record<string, string> = {
  deal: "الفرصة البيعية", deal_convert: "تحويل الفرصة إلى طلب", crm_task: "مهمة متابعة", client: "العميل", verification: "تحقّق الهوية (KYC)", compliance: "اعتماد الالتزام",
  request: "طلب التأمين", policy_request: "طلب التأمين",
  slip: "طلب التسعير (RFQ)", slip_rfq_sent: "إرسال طلب العرض للمؤمِّنين", quotation: "عرض سعر", firm_order: "أمر الإسناد (اختيار العرض)", proposal: "عرض العروض على العميل", cover_note: "مذكرة تغطية مؤقتة",
  policy: "الوثيقة", policy_technical: "الاعتماد الفني", policy_finance: "الاعتماد المالي", policy_approval_step: "خطوة اعتماد", policy_cancellation: "إلغاء الوثيقة", endorsement: "ملحق (Endorsement)",
  claim: "مطالبة", claim_status: "تحديث حالة المطالبة", service_request: "طلب خدمة", complaint: "شكوى",
  receipt: "سند قبض", voucher: "سند مالي", credit_note_refund: "استرداد إشعار دائن", commission_receipt: "تحصيل عمولة", installment_plan: "خطة أقساط", debit_note: "إشعار مدين", credit_note: "إشعار دائن", invoice: "فاتورة ضريبية", insurer_settlement: "تسوية مؤمِّن", producer_settlement: "صرف عمولة منتِج", employee_commission_settlement: "صرف عمولة موظف",
  login: "تسجيل دخول", staff: "الموظف",
};

const ACTION_AR: Record<string, string> = { create: "إنشاء", update: "تحديث", delete: "حذف", approve: "اعتماد", verify: "تحقّق", revert: "تراجع", file_url: "مستند", login: "دخول" };

// كيانات وصفها إجراء بذاته (لا يسبقها فعل)
const SELF_DESCRIBING = new Set(["deal_convert", "slip_rfq_sent", "firm_order", "proposal", "policy_technical", "policy_finance", "policy_approval_step", "policy_cancellation", "commission_receipt", "credit_note_refund", "insurer_settlement", "producer_settlement", "employee_commission_settlement", "compliance", "verification", "login"]);

export function auditPhase(entity: string): string {
  return AUDIT_PHASE[entity] ?? "other";
}

export function describeAudit(entity: string, action: string): string {
  const noun = ENTITY_AR[entity];
  if (!noun) return `${ACTION_AR[action] ?? action} · ${entity}`;
  if (SELF_DESCRIBING.has(entity)) return noun;
  return `${ACTION_AR[action] ?? action} ${noun}`;
}
