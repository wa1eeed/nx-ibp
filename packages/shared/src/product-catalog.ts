// كتالوج المنتجات (فئات وفروع التأمين) — متنوّع ليغطّي عائلات منتجات الوسيط السعودي.
// كل فرع يحدّد مفاتيح الكتل المتكررة في نموذجه (تفاصيل الحقول في form-schemas.ts).
// قابل للتوسيع من الملحق 6.A دون تغيير الكود (مدفوع بمخطط).

export type BlockKey =
  | "members" // تابعون (طبي)
  | "vehicles" // مركبات
  | "locations" // مواقع/أصول (ممتلكات/هندسي)
  | "shipments" // شحنات (بحري)
  | "lives" // أرواح مؤمَّنة (حياة/حوادث شخصية)
  | "travellers"; // مسافرون (سفر)

export interface CatalogLine {
  code: string;
  nameAr: string;
  nameEn: string;
  blocks: BlockKey[]; // الكتل المتكررة المفعّلة (0..n)
}

export interface CatalogClass {
  code: string;
  nameAr: string;
  nameEn: string;
  lines: CatalogLine[];
  /** فئة معفاة من ضريبة القيمة المضافة (خدمة مالية — المادة 29). أقساطها 0% وفئة ZATCA "E". */
  vatExempt?: boolean;
}

export const PRODUCT_CATALOG: CatalogClass[] = [
  {
    code: "MED", nameAr: "الطبي", nameEn: "Medical",
    lines: [
      { code: "GMI", nameAr: "طبي جماعي", nameEn: "Group Medical", blocks: ["members"] },
      { code: "IMI", nameAr: "طبي فردي", nameEn: "Individual Medical", blocks: ["members"] },
      { code: "SME", nameAr: "طبي المنشآت الصغيرة والمتوسطة", nameEn: "SME Medical", blocks: ["members"] },
      { code: "EXP", nameAr: "طبي العمالة/المقيمين", nameEn: "Labor/Expat Medical", blocks: ["members"] },
      { code: "MVI", nameAr: "طبي كبار الشخصيات (VIP)", nameEn: "VIP Medical", blocks: ["members"] },
    ],
  },
  {
    code: "MOT", nameAr: "المركبات", nameEn: "Motor",
    lines: [
      { code: "MCI", nameAr: "مركبات شامل", nameEn: "Motor Comprehensive", blocks: ["vehicles"] },
      { code: "MTP", nameAr: "مركبات ضد الغير", nameEn: "Motor Third Party", blocks: ["vehicles"] },
      { code: "MFL", nameAr: "أسطول مركبات", nameEn: "Motor Fleet", blocks: ["vehicles"] },
    ],
  },
  {
    code: "PRP", nameAr: "الممتلكات", nameEn: "Property",
    lines: [
      { code: "PAR", nameAr: "جميع أخطار الممتلكات", nameEn: "Property All Risks", blocks: ["locations"] },
      { code: "FIR", nameAr: "الحريق والأخطار الإضافية", nameEn: "Fire & Allied Perils", blocks: ["locations"] },
      { code: "BIZ", nameAr: "خسارة الأرباح/انقطاع الأعمال", nameEn: "Business Interruption", blocks: ["locations"] },
      { code: "HOU", nameAr: "المنازل والمحتويات", nameEn: "Householders", blocks: ["locations"] },
      { code: "BBB", nameAr: "السطو والسرقة", nameEn: "Burglary & Theft", blocks: ["locations"] },
    ],
  },
  {
    code: "ENG", nameAr: "الهندسي", nameEn: "Engineering",
    lines: [
      { code: "CAR", nameAr: "جميع أخطار المقاولين", nameEn: "Contractors All Risks", blocks: ["locations"] },
      { code: "EAR", nameAr: "جميع أخطار التركيب", nameEn: "Erection All Risks", blocks: ["locations"] },
      { code: "MBD", nameAr: "عطل الآلات", nameEn: "Machinery Breakdown", blocks: ["locations"] },
      { code: "EEI", nameAr: "المعدات الإلكترونية", nameEn: "Electronic Equipment", blocks: ["locations"] },
      { code: "CPM", nameAr: "آليات ومعدات المقاول", nameEn: "Contractors Plant & Machinery", blocks: ["locations"] },
      { code: "DSU", nameAr: "تأخّر بدء التشغيل", nameEn: "Delay in Start-Up", blocks: ["locations"] },
    ],
  },
  {
    code: "MAR", nameAr: "البحري", nameEn: "Marine",
    lines: [
      { code: "MCG", nameAr: "بحري بضائع", nameEn: "Marine Cargo", blocks: ["shipments"] },
      { code: "MHU", nameAr: "أجسام السفن", nameEn: "Marine Hull", blocks: ["shipments"] },
      { code: "MFT", nameAr: "أجرة الشحن", nameEn: "Marine Freight", blocks: ["shipments"] },
    ],
  },
  {
    code: "GEN", nameAr: "الحوادث والمسؤوليات", nameEn: "Accident & Liability",
    lines: [
      { code: "GPA", nameAr: "حوادث شخصية جماعية", nameEn: "Group Personal Accident", blocks: ["lives"] },
      { code: "IPA", nameAr: "حوادث شخصية فردية", nameEn: "Individual Personal Accident", blocks: ["lives"] },
      { code: "PLI", nameAr: "مسؤولية عامة", nameEn: "Public Liability", blocks: [] },
      { code: "PRL", nameAr: "مسؤولية المنتجات", nameEn: "Product Liability", blocks: [] },
      { code: "PMI", nameAr: "مسؤولية مهنية", nameEn: "Professional Indemnity", blocks: [] },
      { code: "DNO", nameAr: "مسؤولية أعضاء مجلس الإدارة", nameEn: "Directors & Officers", blocks: [] },
      { code: "EPL", nameAr: "مسؤولية أصحاب العمل", nameEn: "Employers Liability", blocks: [] },
      { code: "MML", nameAr: "الأخطاء الطبية", nameEn: "Medical Malpractice", blocks: [] },
      { code: "CYB", nameAr: "التأمين السيبراني", nameEn: "Cyber", blocks: [] },
      { code: "FID", nameAr: "خيانة الأمانة", nameEn: "Fidelity Guarantee", blocks: [] },
      { code: "TRV", nameAr: "تأمين السفر", nameEn: "Travel", blocks: ["travellers"] },
    ],
  },
  {
    code: "AVI", nameAr: "الطيران", nameEn: "Aviation",
    lines: [
      { code: "AVH", nameAr: "أجسام الطائرات", nameEn: "Aviation Hull", blocks: [] },
      { code: "AVL", nameAr: "مسؤولية الطيران", nameEn: "Aviation Liability", blocks: [] },
    ],
  },
  {
    code: "ENR", nameAr: "الطاقة", nameEn: "Energy",
    lines: [
      { code: "ENO", nameAr: "الطاقة البرية/البحرية", nameEn: "Energy Onshore/Offshore", blocks: ["locations"] },
      { code: "ENP", nameAr: "الحقول والمنشآت النفطية", nameEn: "Oil & Gas Facilities", blocks: ["locations"] },
    ],
  },
  {
    code: "BND", nameAr: "الضمانات والسندات", nameEn: "Bonds & Surety",
    lines: [
      { code: "BID", nameAr: "ضمان دخول المناقصات", nameEn: "Bid Bond", blocks: [] },
      { code: "PRF", nameAr: "ضمان حسن التنفيذ", nameEn: "Performance Bond", blocks: [] },
      { code: "ADV", nameAr: "ضمان الدفعة المقدمة", nameEn: "Advance Payment Bond", blocks: [] },
      { code: "MNT", nameAr: "ضمان الصيانة", nameEn: "Maintenance Bond", blocks: [] },
      { code: "CUS", nameAr: "الضمان الجمركي", nameEn: "Customs Bond", blocks: [] },
    ],
  },
  {
    code: "LIF", nameAr: "الحياة والحماية", nameEn: "Life & Protection", vatExempt: true,
    lines: [
      { code: "TRM", nameAr: "تأمين حياة لأجل", nameEn: "Term Life", blocks: ["lives"] },
      { code: "GLI", nameAr: "تأمين حياة جماعي", nameEn: "Group Life", blocks: ["lives"] },
      { code: "CRL", nameAr: "الحماية الائتمانية", nameEn: "Credit Life", blocks: ["lives"] },
      { code: "MTG", nameAr: "حماية التمويل العقاري", nameEn: "Mortgage Protection", blocks: ["lives"] },
      { code: "SAV", nameAr: "الادخار والاستثمار", nameEn: "Savings & Investment", blocks: ["lives"] },
    ],
  },
];

/** كل أكواد الفروع (للتهيئة والزرع). */
export const ALL_LINE_CODES: string[] = PRODUCT_CATALOG.flatMap((c) => c.lines.map((l) => l.code));

/** كود فئة المنتج لفرع مُعطى (line code). */
export function classCodeOfLine(lineCode: string): string | undefined {
  return PRODUCT_CATALOG.find((c) => c.lines.some((l) => l.code === lineCode))?.code;
}

/** هل قسط هذا الفرع معفى من ضريبة القيمة المضافة؟ (تأمين الحياة/فئة LIF). */
export function isVatExemptLine(lineCode: string): boolean {
  const cls = PRODUCT_CATALOG.find((c) => c.lines.some((l) => l.code === lineCode));
  return !!cls?.vatExempt;
}
