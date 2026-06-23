// مخططات النماذج الديناميكية لكل فرع تأمين (Form Schemas).
// مؤلّفة لتعكس اختلاف بيانات كل منتج. تُزرع في FormSchema ويتحقّق منها الـ API.
import type { BlockDef, FieldDef, FormSchemaDef, SectionDef } from "./form-schema";
import { GENDER_OPTIONS, RELATION_OPTIONS, YESNO } from "./form-schema";

// ---------- حقول وكتل معاد استخدامها ----------

const periodSection: SectionDef = {
  key: "period", titleAr: "مدة التغطية", titleEn: "Cover Period",
  fields: [
    { key: "startDate", labelAr: "تاريخ البداية", labelEn: "Start date", type: "date", required: true, span: 2 },
    { key: "endDate", labelAr: "تاريخ النهاية", labelEn: "End date", type: "date", required: true, span: 2 },
    { key: "previousInsurer", labelAr: "شركة التأمين السابقة", labelEn: "Previous insurer", type: "text", span: 2 },
    { key: "hasPriorClaims", labelAr: "مطالبات سابقة؟", labelEn: "Prior claims?", type: "select", options: YESNO, span: 2 },
  ],
};

const membersBlock: BlockDef = {
  key: "members", titleAr: "التابعون (السجل الطبي)", titleEn: "Census (Members)",
  itemLabelAr: "تابع", itemLabelEn: "member", min: 1,
  fields: [
    { key: "name", labelAr: "الاسم", labelEn: "Name", type: "text", required: true, span: 2 },
    { key: "nationalId", labelAr: "الهوية/الإقامة", labelEn: "ID/Iqama", type: "nationalId", required: true, span: 2 },
    { key: "relation", labelAr: "صلة القرابة", labelEn: "Relation", type: "select", options: RELATION_OPTIONS, required: true },
    { key: "dob", labelAr: "تاريخ الميلاد", labelEn: "Date of birth", type: "date", required: true },
    { key: "gender", labelAr: "الجنس", labelEn: "Gender", type: "select", options: GENDER_OPTIONS, required: true },
    { key: "tier", labelAr: "فئة المنفعة", labelEn: "Benefit class", type: "select", options: [
      { value: "vip", labelAr: "VIP", labelEn: "VIP" },
      { value: "a", labelAr: "أ", labelEn: "A" },
      { value: "b", labelAr: "ب", labelEn: "B" },
      { value: "c", labelAr: "ج", labelEn: "C" },
    ] },
    { key: "nationality", labelAr: "الجنسية", labelEn: "Nationality", type: "text" },
  ],
};

const livesBlock: BlockDef = {
  key: "lives", titleAr: "الأرواح المؤمَّنة", titleEn: "Insured Lives",
  itemLabelAr: "مؤمَّن عليه", itemLabelEn: "life", min: 1,
  fields: [
    { key: "name", labelAr: "الاسم", labelEn: "Name", type: "text", required: true, span: 2 },
    { key: "nationalId", labelAr: "الهوية/الإقامة", labelEn: "ID/Iqama", type: "nationalId", required: true, span: 2 },
    { key: "dob", labelAr: "تاريخ الميلاد", labelEn: "Date of birth", type: "date", required: true },
    { key: "gender", labelAr: "الجنس", labelEn: "Gender", type: "select", options: GENDER_OPTIONS, required: true },
    { key: "occupation", labelAr: "المهنة", labelEn: "Occupation", type: "text" },
    { key: "sumAssured", labelAr: "مبلغ التغطية", labelEn: "Sum assured", type: "currency", required: true },
    { key: "beneficiary", labelAr: "المستفيد", labelEn: "Beneficiary", type: "text", span: 2 },
  ],
};

const vehiclesBlock: BlockDef = {
  key: "vehicles", titleAr: "المركبات", titleEn: "Vehicles",
  itemLabelAr: "مركبة", itemLabelEn: "vehicle", min: 1,
  fields: [
    { key: "make", labelAr: "الصانع", labelEn: "Make", type: "text", required: true },
    { key: "model", labelAr: "الطراز", labelEn: "Model", type: "text", required: true },
    { key: "year", labelAr: "سنة الصنع", labelEn: "Year", type: "number", required: true, min: 1980, max: 2027 },
    { key: "plate", labelAr: "رقم اللوحة", labelEn: "Plate no.", type: "text", required: true },
    { key: "vin", labelAr: "رقم الهيكل (VIN)", labelEn: "VIN/Serial", type: "text", required: true, span: 2 },
    { key: "value", labelAr: "قيمة المركبة", labelEn: "Vehicle value", type: "currency", required: true },
    { key: "usage", labelAr: "الاستخدام", labelEn: "Usage", type: "select", required: true, options: [
      { value: "private", labelAr: "خصوصي", labelEn: "Private" },
      { value: "commercial", labelAr: "تجاري", labelEn: "Commercial" },
      { value: "transport", labelAr: "نقل", labelEn: "Transport" },
    ] },
    { key: "driverAge", labelAr: "عمر السائق", labelEn: "Driver age", type: "number", min: 18, max: 90 },
  ],
};

const locationsBlock: BlockDef = {
  key: "locations", titleAr: "المواقع والأصول", titleEn: "Locations & Assets",
  itemLabelAr: "موقع", itemLabelEn: "location", min: 1,
  fields: [
    { key: "description", labelAr: "وصف الموقع", labelEn: "Description", type: "text", required: true, span: 2 },
    { key: "city", labelAr: "المدينة", labelEn: "City", type: "text", required: true },
    { key: "occupancy", labelAr: "طبيعة النشاط", labelEn: "Occupancy", type: "text" },
    { key: "construction", labelAr: "نوع البناء", labelEn: "Construction", type: "select", options: [
      { value: "concrete", labelAr: "خرساني", labelEn: "Concrete" },
      { value: "steel", labelAr: "حديدي", labelEn: "Steel" },
      { value: "mixed", labelAr: "مختلط", labelEn: "Mixed" },
    ] },
    { key: "buildingSI", labelAr: "مبلغ تأمين المبنى", labelEn: "Building sum insured", type: "currency" },
    { key: "contentsSI", labelAr: "مبلغ تأمين المحتويات", labelEn: "Contents sum insured", type: "currency" },
    { key: "stockSI", labelAr: "مبلغ تأمين المخزون", labelEn: "Stock sum insured", type: "currency" },
  ],
};

const shipmentsBlock: BlockDef = {
  key: "shipments", titleAr: "الشحنات", titleEn: "Shipments",
  itemLabelAr: "شحنة", itemLabelEn: "shipment", min: 1,
  fields: [
    { key: "goods", labelAr: "نوع البضاعة", labelEn: "Goods", type: "text", required: true, span: 2 },
    { key: "mode", labelAr: "وسيلة النقل", labelEn: "Transport mode", type: "select", required: true, options: [
      { value: "sea", labelAr: "بحري", labelEn: "Sea" },
      { value: "air", labelAr: "جوي", labelEn: "Air" },
      { value: "land", labelAr: "بري", labelEn: "Land" },
    ] },
    { key: "fromLoc", labelAr: "من", labelEn: "From", type: "text", required: true },
    { key: "toLoc", labelAr: "إلى", labelEn: "To", type: "text", required: true },
    { key: "value", labelAr: "قيمة الشحنة", labelEn: "Cargo value", type: "currency", required: true },
    { key: "packing", labelAr: "طريقة التغليف", labelEn: "Packing", type: "text" },
  ],
};

const travellersBlock: BlockDef = {
  key: "travellers", titleAr: "المسافرون", titleEn: "Travellers",
  itemLabelAr: "مسافر", itemLabelEn: "traveller", min: 1,
  fields: [
    { key: "name", labelAr: "الاسم", labelEn: "Name", type: "text", required: true, span: 2 },
    { key: "nationalId", labelAr: "الهوية/الجواز", labelEn: "ID/Passport", type: "text", required: true, span: 2 },
    { key: "dob", labelAr: "تاريخ الميلاد", labelEn: "Date of birth", type: "date", required: true },
    { key: "destination", labelAr: "الوجهة", labelEn: "Destination", type: "select", required: true, options: [
      { value: "schengen", labelAr: "شنغن", labelEn: "Schengen" },
      { value: "worldwide", labelAr: "حول العالم", labelEn: "Worldwide" },
      { value: "gcc", labelAr: "دول الخليج", labelEn: "GCC" },
    ] },
    { key: "tripDays", labelAr: "عدد أيام الرحلة", labelEn: "Trip days", type: "number", required: true, min: 1, max: 365 },
  ],
};

// ---------- مخطط أساسي مشترك ----------
function base(lineCode: string, extra: SectionDef[], blocks: BlockDef[]): FormSchemaDef {
  return {
    lineCode,
    version: 1,
    sections: [
      {
        key: "general", titleAr: "بيانات عامة", titleEn: "General",
        fields: [
          { key: "insuredName", labelAr: "اسم المؤمَّن له", labelEn: "Insured name", type: "text", required: true, span: 2 },
          { key: "currency", labelAr: "العملة", labelEn: "Currency", type: "text", span: 2 },
        ],
      },
      periodSection,
      ...extra,
    ],
    blocks,
  };
}

// أقسام خاصة بفروع مختارة
const medicalNetwork: SectionDef = {
  key: "medical", titleAr: "بيانات التغطية الطبية", titleEn: "Medical Cover",
  fields: [
    { key: "network", labelAr: "الشبكة الطبية", labelEn: "Network", type: "select", required: true, options: [
      { value: "vip", labelAr: "VIP", labelEn: "VIP" },
      { value: "plus", labelAr: "بلس", labelEn: "Plus" },
      { value: "standard", labelAr: "قياسية", labelEn: "Standard" },
    ] },
    { key: "annualLimit", labelAr: "الحد السنوي للفرد", labelEn: "Annual limit / member", type: "currency", required: true },
    { key: "dental", labelAr: "تغطية الأسنان", labelEn: "Dental cover", type: "select", options: YESNO, span: 1 },
    { key: "optical", labelAr: "تغطية النظارات", labelEn: "Optical cover", type: "select", options: YESNO, span: 1 },
    { key: "maternity", labelAr: "تغطية الأمومة", labelEn: "Maternity cover", type: "select", options: YESNO, span: 1 },
  ],
};

const motorCover: SectionDef = {
  key: "motor", titleAr: "بيانات تغطية المركبات", titleEn: "Motor Cover",
  fields: [
    { key: "coverType", labelAr: "نوع التغطية", labelEn: "Cover type", type: "select", required: true, options: [
      { value: "comprehensive", labelAr: "شامل", labelEn: "Comprehensive" },
      { value: "tpl", labelAr: "ضد الغير", labelEn: "Third Party" },
    ] },
    { key: "fleetDiscount", labelAr: "خصم الأسطول %", labelEn: "Fleet discount %", type: "percent", min: 0, max: 100 },
    { key: "geoCoverage", labelAr: "النطاق الجغرافي", labelEn: "Geographic coverage", type: "select", options: [
      { value: "ksa", labelAr: "السعودية", labelEn: "KSA" },
      { value: "gcc", labelAr: "دول الخليج", labelEn: "GCC" },
    ] },
  ],
};

const liabilitySection: SectionDef = {
  key: "liability", titleAr: "حدود المسؤولية", titleEn: "Liability Limits",
  fields: [
    { key: "limitPerEvent", labelAr: "الحد لكل حادث", labelEn: "Limit per event", type: "currency", required: true, span: 2 },
    { key: "aggregateLimit", labelAr: "الحد الإجمالي", labelEn: "Aggregate limit", type: "currency", required: true, span: 2 },
    { key: "businessNature", labelAr: "طبيعة النشاط", labelEn: "Business nature", type: "text", span: 4 },
  ],
};

const lifeSection: SectionDef = {
  key: "life", titleAr: "بيانات تأمين الحياة", titleEn: "Life Cover",
  fields: [
    { key: "termYears", labelAr: "مدة التأمين (سنوات)", labelEn: "Term (years)", type: "number", required: true, min: 1, max: 40 },
    { key: "premiumFrequency", labelAr: "دورية القسط", labelEn: "Premium frequency", type: "select", required: true, options: [
      { value: "monthly", labelAr: "شهري", labelEn: "Monthly" },
      { value: "annual", labelAr: "سنوي", labelEn: "Annual" },
    ] },
    { key: "smoker", labelAr: "مدخّن؟", labelEn: "Smoker?", type: "select", options: YESNO },
  ],
};

const engineeringSection: SectionDef = {
  key: "engineering", titleAr: "بيانات المشروع", titleEn: "Project Details",
  fields: [
    { key: "contractValue", labelAr: "قيمة العقد", labelEn: "Contract value", type: "currency", required: true, span: 2 },
    { key: "projectPeriodMonths", labelAr: "مدة المشروع (أشهر)", labelEn: "Project period (months)", type: "number", required: true },
    { key: "principal", labelAr: "صاحب العمل", labelEn: "Principal", type: "text", span: 2 },
  ],
};

// ---------- المخططات لكل فرع ----------
export const FORM_SCHEMAS: Record<string, FormSchemaDef> = {
  GMI: base("GMI", [medicalNetwork], [membersBlock]),
  IMI: base("IMI", [medicalNetwork], [membersBlock]),
  MCI: base("MCI", [motorCover], [vehiclesBlock]),
  MTP: base("MTP", [motorCover], [vehiclesBlock]),
  PAR: base("PAR", [], [locationsBlock]),
  FIR: base("FIR", [], [locationsBlock]),
  CAR: base("CAR", [engineeringSection], [locationsBlock]),
  EAR: base("EAR", [engineeringSection], [locationsBlock]),
  MCG: base("MCG", [], [shipmentsBlock]),
  GPA: base("GPA", [], [livesBlock]),
  PLI: base("PLI", [liabilitySection], []),
  TRV: base("TRV", [], [travellersBlock]),
  TRM: base("TRM", [lifeSection], [livesBlock]),
  GLI: base("GLI", [lifeSection], [livesBlock]),
};

export function getFormSchema(lineCode: string): FormSchemaDef | undefined {
  return FORM_SCHEMAS[lineCode];
}
