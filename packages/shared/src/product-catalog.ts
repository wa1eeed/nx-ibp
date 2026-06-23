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
}

export const PRODUCT_CATALOG: CatalogClass[] = [
  {
    code: "MED", nameAr: "الطبي", nameEn: "Medical",
    lines: [
      { code: "GMI", nameAr: "طبي جماعي", nameEn: "Group Medical", blocks: ["members"] },
      { code: "IMI", nameAr: "طبي فردي", nameEn: "Individual Medical", blocks: ["members"] },
    ],
  },
  {
    code: "MOT", nameAr: "المركبات", nameEn: "Motor",
    lines: [
      { code: "MCI", nameAr: "مركبات شامل", nameEn: "Motor Comprehensive", blocks: ["vehicles"] },
      { code: "MTP", nameAr: "مركبات ضد الغير", nameEn: "Motor Third Party", blocks: ["vehicles"] },
    ],
  },
  {
    code: "PRP", nameAr: "الممتلكات", nameEn: "Property",
    lines: [
      { code: "PAR", nameAr: "جميع أخطار الممتلكات", nameEn: "Property All Risks", blocks: ["locations"] },
      { code: "FIR", nameAr: "الحريق والأخطار الإضافية", nameEn: "Fire & Allied Perils", blocks: ["locations"] },
    ],
  },
  {
    code: "ENG", nameAr: "الهندسي", nameEn: "Engineering",
    lines: [
      { code: "CAR", nameAr: "جميع أخطار المقاولين", nameEn: "Contractors All Risks", blocks: ["locations"] },
      { code: "EAR", nameAr: "جميع أخطار التركيب", nameEn: "Erection All Risks", blocks: ["locations"] },
    ],
  },
  {
    code: "MAR", nameAr: "البحري", nameEn: "Marine",
    lines: [
      { code: "MCG", nameAr: "بحري بضائع", nameEn: "Marine Cargo", blocks: ["shipments"] },
    ],
  },
  {
    code: "GEN", nameAr: "الحوادث العامة", nameEn: "General Accident",
    lines: [
      { code: "GPA", nameAr: "حوادث شخصية جماعية", nameEn: "Group Personal Accident", blocks: ["lives"] },
      { code: "PLI", nameAr: "مسؤولية عامة", nameEn: "Public Liability", blocks: [] },
      { code: "TRV", nameAr: "تأمين السفر", nameEn: "Travel", blocks: ["travellers"] },
    ],
  },
  {
    code: "LIF", nameAr: "الحياة", nameEn: "Life",
    lines: [
      { code: "TRM", nameAr: "تأمين حياة لأجل", nameEn: "Term Life", blocks: ["lives"] },
      { code: "GLI", nameAr: "تأمين حياة جماعي", nameEn: "Group Life", blocks: ["lives"] },
    ],
  },
];

/** كل أكواد الفروع (للتهيئة والزرع). */
export const ALL_LINE_CODES: string[] = PRODUCT_CATALOG.flatMap((c) => c.lines.map((l) => l.code));
