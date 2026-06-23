// لغة وصف النموذج الديناميكي (Form Schema DSL).
// مصدر واحد يستهلكه: الـ seed (يؤلّف المخططات)، الواجهة (تعرضها)، والـ API (يتحقّق منها).
// مصمّمة لاستيعاب تنوّع منتجات التأمين: طبي/مركبات/ممتلكات/هندسي/بحري/عام/حياة/سفر…

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "currency" // SAR
  | "percent"
  | "date"
  | "select"
  | "multiselect"
  | "boolean"
  | "email"
  | "phone"
  | "nationalId" // هوية/إقامة (10 أرقام)
  | "crNumber" // سجل تجاري
  | "iban";

export interface FieldOption {
  value: string;
  labelAr: string;
  labelEn: string;
}

export interface FieldDef {
  key: string;
  labelAr: string;
  labelEn: string;
  type: FieldType;
  required?: boolean;
  options?: FieldOption[]; // لـ select/multiselect
  min?: number; // للأرقام/العملة/النِّسب
  max?: number;
  maxLength?: number;
  helpAr?: string;
  helpEn?: string;
  span?: 1 | 2 | 3 | 4; // تلميح تخطيط (عرض الحقل ضمن شبكة 4 أعمدة)
}

export interface SectionDef {
  key: string;
  titleAr: string;
  titleEn: string;
  fields: FieldDef[];
}

/** كتلة متكررة (صفوف): تابعون، مركبات، مواقع، شحنات، أرواح مؤمَّنة، مسافرون… */
export interface BlockDef {
  key: string;
  titleAr: string;
  titleEn: string;
  /** اسم مفرد للصف (تابع/مركبة…) لزرّ الإضافة. */
  itemLabelAr: string;
  itemLabelEn: string;
  min?: number; // أقل عدد صفوف مطلوب
  max?: number;
  fields: FieldDef[];
}

export interface FormSchemaDef {
  lineCode: string;
  version: number;
  /** الحقول الأساسية مجمّعة بأقسام. */
  sections: SectionDef[];
  /** الكتل المتكررة المفعّلة لهذا الفرع (قد تكون فارغة). */
  blocks: BlockDef[];
}

// خيارات مشتركة معاد استخدامها
export const YESNO: FieldOption[] = [
  { value: "yes", labelAr: "نعم", labelEn: "Yes" },
  { value: "no", labelAr: "لا", labelEn: "No" },
];

export const RELATION_OPTIONS: FieldOption[] = [
  { value: "employee", labelAr: "موظف", labelEn: "Employee" },
  { value: "spouse", labelAr: "زوج/زوجة", labelEn: "Spouse" },
  { value: "child", labelAr: "ابن/ابنة", labelEn: "Child" },
  { value: "parent", labelAr: "والد/والدة", labelEn: "Parent" },
];

export const GENDER_OPTIONS: FieldOption[] = [
  { value: "male", labelAr: "ذكر", labelEn: "Male" },
  { value: "female", labelAr: "أنثى", labelEn: "Female" },
];
