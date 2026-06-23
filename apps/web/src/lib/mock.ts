// بيانات وهمية للعرض فقط (UI-First) — لا قاعدة بيانات في المرحلة 0.
// تُستبدل ببيانات حقيقية مفلترة بالمستأجر في المراحل اللاحقة.

export type KycStatus = "completed" | "in_progress" | "expired";
export type CommissionStatus = "received" | "variance" | "accrued";
export type TaskKind = "renewal" | "approval" | "kyc";

export const dashboardKpis = {
  expiring: 3,
  pending: 7,
  renewalsCount: 8,
  renewalsAmount: "SAR 2,840,500",
  commissions: "SAR 178,000",
};

export interface UrgentTask {
  id: string;
  kind: TaskKind;
  ref: string;
  client: string;
  due: string;
  amount?: string;
}

export const urgentTasks: UrgentTask[] = [
  { id: "t1", kind: "renewal", ref: "RBI-2025-0150", client: "شركة الحربية للنقل", due: "today", amount: "SAR 1,437,500" },
  { id: "t2", kind: "approval", ref: "REQ-2026-0091", client: "شركة المنارة التقنية", due: "today" },
  { id: "t3", kind: "kyc", ref: "KYC-2026-0033", client: "مؤسسة الإنماء الغذائية", due: "8d" },
  { id: "t4", kind: "renewal", ref: "RBI-2025-0042", client: "مؤسسة الإنماء للمواد الغذائية", due: "17d", amount: "SAR 488,750" },
  { id: "t5", kind: "renewal", ref: "RBI-2025-0034", client: "شركة الجزيرة للطاقة", due: "17d", amount: "SAR 312,000" },
];

export const renewals = {
  count: 44,
  amount: "SAR 8,655,000",
  // أعمدة 12 شهراً (قيم نسبية للرسم)
  series: [8, 10, 7, 12, 9, 6, 5, 7, 11, 44, 22, 14],
  months: ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May"],
};

export const recentActivity = [
  { id: "a1", text: "تم إصدار وثيقة جديدة لـ مجموعة الزهراء الطبية", when: "قبل ساعة" },
  { id: "a2", text: "استلام عمولة من التعاونية بقيمة SAR 53,125", when: "قبل 3 ساعات" },
  { id: "a3", text: "طلب خدمة جديد من شركة الفهد للمقاولات", when: "أمس" },
];

export interface ClientRow {
  id: string;
  type: "corporate" | "individual";
  name: string;
  cr: string;
  contactName: string;
  mobile: string;
  city: string;
  activePolicies: number;
  kyc: KycStatus;
  lastInteraction: string;
}

export const clientRows: ClientRow[] = [
  { id: "c1", type: "corporate", name: "شركة الفهد للمقاولات", cr: "0114567890", contactName: "خالد الفهد", mobile: "0114567890", city: "الرياض", activePolicies: 4, kyc: "completed", lastInteraction: "9 May 2026" },
  { id: "c2", type: "corporate", name: "مجموعة الزهراء الطبية", cr: "4038887766", contactName: "د. سلمى الزهراء", mobile: "0126789012", city: "جدة", activePolicies: 3, kyc: "completed", lastInteraction: "12 May 2026" },
  { id: "c3", type: "corporate", name: "منارة تك", cr: "1010998877", contactName: "ريم القحطاني", mobile: "0114561122", city: "الرياض", activePolicies: 2, kyc: "in_progress", lastInteraction: "13 May 2026" },
  { id: "c4", type: "corporate", name: "الشروق للنقل والتجارة", cr: "2058776655", contactName: "عبدالله المطيري", mobile: "0138899001", city: "الدمام", activePolicies: 2, kyc: "completed", lastInteraction: "8 May 2026" },
  { id: "c5", type: "corporate", name: "أغذية الواحة", cr: "4038112233", contactName: "نورة العتيبي", mobile: "0124433221", city: "جدة", activePolicies: 1, kyc: "expired", lastInteraction: "3 May 2026" },
  { id: "c6", type: "corporate", name: "الجزيرة للطاقة", cr: "2855667788", contactName: "م. فيصل الدوسري", mobile: "0138812233", city: "الخبر", activePolicies: 5, kyc: "completed", lastInteraction: "11 May 2026" },
];

export const clientTabs = { all: 10, corporate: 6, individual: 4 };

export interface CommissionRow {
  policyNo: string;
  client: string;
  insurer: string;
  rate: string;
  amount: string;
  received: string;
  variance: string;
  status: CommissionStatus;
}

export const commissionSummary = {
  total: "SAR 433,385",
  received: "SAR 337,695",
  receivedPct: "78%",
  pending: "SAR 93,990",
  variance: "SAR 2,300",
};

export const commissionRows: CommissionRow[] = [
  { policyNo: "RBI-2025-0042", client: "شركة الفهد للمقاولات", insurer: "التعاونية", rate: "12.5%", amount: "SAR 53,125", received: "SAR 53,125", variance: "—", status: "received" },
  { policyNo: "RBI-2025-0043", client: "شركة الفهد للمقاولات", insurer: "ولاء", rate: "10%", amount: "SAR 18,000", received: "SAR 17,500", variance: "-SAR 500", status: "variance" },
  { policyNo: "RBI-2026-0011", client: "شركة الفهد للمقاولات", insurer: "ميدغلف", rate: "11%", amount: "SAR 23,650", received: "—", variance: "—", status: "accrued" },
  { policyNo: "RBI-2025-0099", client: "شركة الفهد للمقاولات", insurer: "بوبا العربية", rate: "9%", amount: "SAR 8,550", received: "SAR 8,550", variance: "—", status: "received" },
  { policyNo: "RBI-2025-0078", client: "مجموعة الزهراء الطبية", insurer: "بوبا العربية", rate: "12%", amount: "SAR 81,600", received: "SAR 81,600", variance: "—", status: "received" },
  { policyNo: "RBI-2025-0079", client: "مجموعة الزهراء الطبية", insurer: "التعاونية", rate: "10%", amount: "SAR 7,500", received: "—", variance: "—", status: "accrued" },
];
