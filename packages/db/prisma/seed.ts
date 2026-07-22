/**
 * بذرة بيانات وهمية فقط (Mock) — قاعدة المشروع: لا بيانات حقيقية في التطوير.
 * idempotent: يمكن تشغيله مراراً (upsert بمعرّفات ثابتة).
 *   pnpm --filter @ibp/db seed
 *
 * مستأجران لإثبات العزل + مصفوفة باقات/صلاحيات للمرحلة 2.
 * كلمة مرور التطوير الموحّدة: Passw0rd!
 */
import { PrismaClient, Prisma } from "../generated/client";
import { PRODUCT_CATALOG, PRESET_ROLES, RBAC_MODULES, parsePerm, FORM_SCHEMAS } from "@ibp/shared";
import * as bcrypt from "bcryptjs";

const asJson = (v: unknown) => v as unknown as Prisma.InputJsonValue;

const prisma = new PrismaClient();

const DEV_PASSWORD = "Passw0rd!";

type EntMode = "INCLUDED" | "QUOTA" | "METERED" | "ADDON" | "DISABLED";

// مصفوفة الموديولز لكل باقة (entitlement: module.<x>).
// المبدأ: الأساسية تضمّ **كل موديولات التشغيل والامتثال** التي تتطلّبها هيئة التأمين (لا تُحجب الأساسيات)؛
// التمايز على المميزات المتقدمة (النموّ/الحوكمة) والحصص، لا على الجوهر التشغيلي.
const PLAN_MODULES: Record<string, Record<string, EntMode>> = {
  basic: { clients: "INCLUDED", sales: "INCLUDED", underwriting: "INCLUDED", production: "INCLUDED", renewals: "INCLUDED", service: "INCLUDED", claims: "INCLUDED", finance: "INCLUDED", compliance: "INCLUDED", reports: "INCLUDED", hr: "INCLUDED" },
  premium: { clients: "INCLUDED", sales: "INCLUDED", underwriting: "INCLUDED", production: "INCLUDED", renewals: "INCLUDED", service: "INCLUDED", claims: "INCLUDED", finance: "INCLUDED", compliance: "INCLUDED", reports: "INCLUDED", hr: "INCLUDED" },
  enterprise: { clients: "INCLUDED", sales: "INCLUDED", underwriting: "INCLUDED", production: "INCLUDED", renewals: "INCLUDED", service: "INCLUDED", claims: "INCLUDED", finance: "INCLUDED", compliance: "INCLUDED", reports: "INCLUDED", hr: "INCLUDED" },
};

// مميزات المنصّة (غير الموديولز) لكل باقة — قابلة للتفعيل/التعطيل من السوبر أدمن وتظهر في صفحة المقارنة.
const F = (key: string, mode: EntMode, extra: { numericValue?: number; unitFee?: number } = {}) => ({ key, mode, ...extra });
const PLAN_FEATURES: Record<string, Array<{ key: string; mode: EntMode; numericValue?: number; unitFee?: number }>> = {
  basic: [
    F("upload.maxFileMb", "QUOTA", { numericValue: 10 }), F("storage.quotaMb", "QUOTA", { numericValue: 1024 }), // 1GB
    F("feature.verification", "INCLUDED"), F("feature.auditImmutable", "INCLUDED"), // إلزامي هيئة التأمين
    F("feature.zatca", "DISABLED"), // ZATCA فوترة إلكترونية = مالية متقدّمة ⇒ الاحترافية فأعلى
    F("feature.crm", "DISABLED"), F("feature.producers", "DISABLED"), F("feature.formTemplates", "DISABLED"),
    F("feature.analytics", "DISABLED"), F("feature.approvalChains", "DISABLED"), F("feature.org", "DISABLED"), F("feature.mfaEnforce", "DISABLED"),
    F("feature.dlp", "DISABLED"), F("feature.api", "DISABLED"), F("feature.whiteLabel", "DISABLED"), F("feature.prioritySupport", "DISABLED"),
    F("feature.carrierIntegration", "ADDON"), // ربط مباشر مع شركة التأمين — يُفعَّل برسوم إعداد لمرّة واحدة
  ],
  premium: [
    F("upload.maxFileMb", "QUOTA", { numericValue: 25 }), F("storage.quotaMb", "QUOTA", { numericValue: 10240 }), // 10GB
    F("feature.verification", "INCLUDED"), F("feature.zatca", "INCLUDED"), F("feature.auditImmutable", "INCLUDED"),
    F("feature.crm", "INCLUDED"), F("feature.producers", "INCLUDED"), F("feature.formTemplates", "INCLUDED"),
    F("feature.analytics", "INCLUDED"), F("feature.approvalChains", "INCLUDED"), F("feature.org", "INCLUDED"), F("feature.mfaEnforce", "INCLUDED"),
    F("feature.dlp", "ADDON"), F("feature.api", "METERED", { unitFee: 0.02 }), F("feature.whiteLabel", "DISABLED"), F("feature.prioritySupport", "DISABLED"),
    F("feature.carrierIntegration", "ADDON"), // ربط مباشر مع شركة التأمين — يُفعَّل برسوم إعداد لمرّة واحدة
  ],
  enterprise: [
    F("upload.maxFileMb", "QUOTA", { numericValue: 100 }), F("storage.quotaMb", "QUOTA", { numericValue: 102400 }), // 100GB
    F("feature.verification", "INCLUDED"), F("feature.zatca", "INCLUDED"), F("feature.auditImmutable", "INCLUDED"),
    F("feature.crm", "INCLUDED"), F("feature.producers", "INCLUDED"), F("feature.formTemplates", "INCLUDED"),
    F("feature.analytics", "INCLUDED"), F("feature.approvalChains", "INCLUDED"), F("feature.org", "INCLUDED"), F("feature.mfaEnforce", "INCLUDED"),
    F("feature.dlp", "INCLUDED"), F("feature.api", "INCLUDED"), F("feature.whiteLabel", "INCLUDED"), F("feature.prioritySupport", "INCLUDED"),
    F("feature.carrierIntegration", "ADDON"), // ربط مباشر مع شركة التأمين — يُفعَّل برسوم إعداد لمرّة واحدة
  ],
};

interface TenantDef {
  id: string;
  name: string;
  nameEn: string;
  cr: string;
  plan: string;
  billing: "PASS_THROUGH" | "RESELLER";
  seatsUsed: number;
  seatsLicensed: number; // المقاعد المرخّصة (حدّ أقصى) — يجب ألّا تقلّ عن عدد المستخدمين المزروعين
  branches: Array<{ code: string; name: string }>;
  users: Array<{ email: string; name: string; role: string }>;
  clients: Array<{ id: string; name: string; cr: string; compliance?: "APPROVED" | "PENDING" | "REJECTED" }>;
  wallets: Array<{ service: string; balance: number }>;
  addons?: string[];
  claims?: Array<{ id: string; seq: string }>;
}

const TENANTS: TenantDef[] = [
  {
    id: "demo-tenant",
    name: "وكالة الخليج لوساطة التأمين",
    nameEn: "Gulf Insurance Brokerage",
    cr: "1010101010",
    plan: "enterprise", // باقة مؤسسات (100 مقعدًا) — سعة كافية لبيئة العرض/الاختبار
    billing: "RESELLER",
    seatsUsed: 7,
    seatsLicensed: 200,
    branches: [
      { code: "RUH", name: "الرياض" },
      { code: "JED", name: "جدة" },
    ],
    users: [
      { email: "waleed@gulf-demo.sa", name: "وليد الحربي", role: "general_manager" },
      { email: "sara@gulf-demo.sa", name: "سارة العتيبي", role: "sales_manager" },
      { email: "fahad@gulf-demo.sa", name: "فهد القحطاني", role: "claims_officer" },
      { email: "laila@gulf-demo.sa", name: "ليلى الشمري", role: "accountant" },
      { email: "huda@gulf-demo.sa", name: "هدى الغامدي", role: "compliance_manager" },
      { email: "majed@gulf-demo.sa", name: "ماجد العمري", role: "pricing_officer" },
      { email: "nora@gulf-demo.sa", name: "نورة الزهراني", role: "customer_care_manager" },
    ],
    clients: [
      { id: "cl-fahd", name: "شركة الفهد للمقاولات", cr: "0114567890", compliance: "APPROVED" },
      { id: "cl-zahra", name: "مجموعة الزهراء الطبية", cr: "4038887766", compliance: "APPROVED" },
      { id: "cl-manara", name: "منارة تك", cr: "1010998877", compliance: "PENDING" },
      { id: "cl-shorouq", name: "الشروق للنقل والتجارة", cr: "2058776655", compliance: "APPROVED" },
      { id: "cl-wahah", name: "أغذية الواحة", cr: "4038112233", compliance: "APPROVED" },
    ],
    wallets: [
      { service: "yaqeen", balance: 250 },
      { service: "wathiq", balance: 120 },
      { service: "nafath", balance: 500 },
    ],
    addons: ["module.claims", "module.reports", "module.compliance"], // إضافات: المطالبات والتقارير والالتزام
    claims: [{ id: "claim-t1-1", seq: "CL-RUH-2026-0001" }],
  },
  {
    id: "demo-tenant-2",
    name: "شركة الأمان لوساطة التأمين",
    nameEn: "Aman Insurance Brokerage",
    cr: "2020202020",
    plan: "basic",
    billing: "PASS_THROUGH",
    seatsUsed: 1,
    seatsLicensed: 50,
    branches: [{ code: "JED", name: "جدة" }],
    users: [{ email: "omar@aman-demo.sa", name: "عمر السالم", role: "general_manager" }],
    clients: [
      { id: "cl2-nukhba", name: "مؤسسة النخبة التجارية", cr: "3033445566" },
      { id: "cl2-rayan", name: "شركة الريّان", cr: "3044556677" },
    ],
    wallets: [{ service: "yaqeen", balance: 50 }],
  },
];

async function seedPlans() {
  // التسعير **لكل مستخدم** بلا حدّ مقاعد (seatLimit=null). التجربة المجانية عبر trialDays فقط.
  // المؤسسات: بلا تجربة ذاتية (0) — «تواصل مع المبيعات» (429ر/مستخدم سعر استرشادي).
  const plans: Array<Prisma.PlanCreateInput> = [
    { code: "basic", name: "الأساسية", seatLimit: null, priceMonthly: 230, priceYearly: 2300, trialDays: 14, slaResponseHours: 24 },
    { code: "premium", name: "الاحترافية", seatLimit: null, priceMonthly: 349, priceYearly: 3490, trialDays: 14, slaResponseHours: 4 },
    { code: "enterprise", name: "المؤسسات", seatLimit: null, priceMonthly: 429, priceYearly: 4290, trialDays: 0, slaResponseHours: 2 },
  ];

  for (const p of plans) {
    const plan = await prisma.plan.upsert({ where: { code: p.code }, update: p, create: p });

    const ents: Array<{ featureKey: string; mode: EntMode; numericValue?: number; unitFee?: number }> = [
      ...Object.entries(PLAN_MODULES[p.code] ?? {}).map(([m, mode]) => ({ featureKey: `module.${m}`, mode })),
      ...(PLAN_FEATURES[p.code] ?? []).map((f) => ({ featureKey: f.key, mode: f.mode, numericValue: f.numericValue, unitFee: f.unitFee })),
    ];

    for (const e of ents) {
      await prisma.entitlement.upsert({
        where: { planId_featureKey: { planId: plan.id, featureKey: e.featureKey } },
        update: { mode: e.mode, numericValue: e.numericValue ?? null, unitFee: e.unitFee ?? null },
        create: { planId: plan.id, featureKey: e.featureKey, mode: e.mode, numericValue: e.numericValue ?? null, unitFee: e.unitFee ?? null },
      });
    }
  }
}

async function seedCatalog() {
  for (const c of PRODUCT_CATALOG) {
    const cls = await prisma.productClass.upsert({
      where: { code: c.code },
      update: { name: c.nameAr },
      create: { code: c.code, name: c.nameAr },
    });
    for (const l of c.lines) {
      const lineId = `line-${c.code}-${l.code}`;
      await prisma.productLine.upsert({
        where: { id: lineId },
        update: { name: l.nameAr },
        create: { id: lineId, classId: cls.id, code: l.code, name: l.nameAr },
      });
      const schema = FORM_SCHEMAS[l.code];
      const baseFields = asJson(schema?.sections ?? []);
      const blocks = asJson(schema?.blocks ?? []);
      await prisma.formSchema.upsert({
        where: { lineId },
        update: { version: schema?.version ?? 1, baseFields, blocks },
        create: { lineId, version: schema?.version ?? 1, baseFields, blocks },
      });
    }
  }
}

async function seedProviders() {
  const providers = [
    { key: "nafath", name: "نفاذ" },
    { key: "yaqeen", name: "يقين" },
    { key: "wathiq", name: "واثق" },
    { key: "spl", name: "العنوان الوطني" },
    { key: "screening", name: "فحص PEP/العقوبات" },
  ];
  for (const p of providers) {
    await prisma.verificationProvider.upsert({ where: { key: p.key }, update: { name: p.name }, create: p });
  }
}

async function seedTenant(def: TenantDef, passwordHash: string) {
  await prisma.tenant.upsert({
    where: { id: def.id },
    update: { name: def.name, nameEn: def.nameEn, billingModel: def.billing },
    create: { id: def.id, name: def.name, nameEn: def.nameEn, crNumber: def.cr, status: "ACTIVE", billingModel: def.billing },
  });

  const plan = await prisma.plan.findUniqueOrThrow({ where: { code: def.plan } });
  const sub = await prisma.subscription.upsert({
    where: { tenantId: def.id },
    update: { planId: plan.id, seatsUsed: def.seatsUsed, seatsLicensed: def.seatsLicensed },
    create: { id: `sub-${def.id}`, tenantId: def.id, planId: plan.id, cycle: "YEARLY", seatsUsed: def.seatsUsed, seatsLicensed: def.seatsLicensed },
  });

  for (const a of def.addons ?? []) {
    await prisma.addonPurchase.upsert({
      where: { id: `addon-${def.id}-${a}` },
      update: { subscriptionId: sub.id, addonKey: a },
      create: { id: `addon-${def.id}-${a}`, subscriptionId: sub.id, addonKey: a, quantity: 1 },
    });
  }

  for (const b of def.branches) {
    await prisma.branch.upsert({
      where: { tenantId_code: { tenantId: def.id, code: b.code } },
      update: { name: b.name },
      create: { tenantId: def.id, code: b.code, name: b.name },
    });
  }

  await prisma.tenantConfig.upsert({
    where: { tenantId: def.id },
    update: {},
    create: {
      tenantId: def.id,
      enabledProducts: PRODUCT_CATALOG.flatMap((c) => c.lines.map((l) => l.code)),
      sequenceFormats: { policy: "POL-{branch}-{class}-{year}-{seq}", lead: "SL-{branch}-{class}-{year}-{seq}" },
      branding: { primary: "#0d9488", logoText: "IBP" },
    },
  });

  // أدوار preset لكل مستأجر
  for (const r of PRESET_ROLES) {
    const roleId = `role-${def.id}-${r.code}`;
    await prisma.role.upsert({
      where: { id: roleId },
      update: { name: r.nameAr, isPreset: true },
      create: { id: roleId, tenantId: def.id, name: r.nameAr, isPreset: true },
    });
    for (const m of RBAC_MODULES) {
      const perm = parsePerm(r.matrix[m]);
      await prisma.permission.upsert({
        where: { roleId_module: { roleId, module: m } },
        update: perm,
        create: { roleId, module: m, ...perm },
      });
    }
  }

  // الهيكل التنظيمي الافتراضي (مطابق لأقسام شركة الوساطة): الإدارة العليا + 6 أقسام، لكلٍّ دوره الافتراضي.
  const DEPTS: Array<{ key: string; name: string; role: string; parent: string | null }> = [
    { key: "mgmt", name: "الإدارة العليا", role: "general_manager", parent: null },
    { key: "sales", name: "المبيعات وتطوير الأعمال", role: "sales_rep", parent: "mgmt" },
    { key: "compliance", name: "الالتزام والمطابقة", role: "compliance_manager", parent: "mgmt" },
    { key: "underwriting", name: "الاكتتاب الفني", role: "pricing_officer", parent: "mgmt" },
    { key: "finance", name: "الإدارة المالية والمحاسبة", role: "accountant", parent: "mgmt" },
    { key: "service", name: "خدمة العملاء", role: "customer_care_manager", parent: "mgmt" },
    { key: "claims", name: "إدارة المطالبات", role: "claims_officer", parent: "mgmt" },
  ];
  for (const d of DEPTS) {
    await prisma.department.upsert({
      where: { id: `dept-${def.id}-${d.key}` },
      update: { name: d.name, defaultRoleId: `role-${def.id}-${d.role}` },
      create: { id: `dept-${def.id}-${d.key}`, tenantId: def.id, name: d.name, parentId: d.parent ? `dept-${def.id}-${d.parent}` : null, defaultRoleId: `role-${def.id}-${d.role}` },
    });
  }
  // إسناد كل موظف لقسمه حسب دوره (يُظهر أعضاء كل قسم في المخطط)
  const ROLE_TO_DEPT: Record<string, string> = {
    general_manager: "mgmt", hr_manager: "mgmt", admin_assistant: "mgmt",
    sales_manager: "sales", sales_rep: "sales", compliance_manager: "compliance",
    pricing_officer: "underwriting", policy_admin: "underwriting",
    accountant: "finance", collector: "finance", customer_care_manager: "service", claims_officer: "claims",
  };

  for (const u of def.users) {
    const deptId = `dept-${def.id}-${ROLE_TO_DEPT[u.role] ?? "mgmt"}`;
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId: def.id, email: u.email } },
      update: { fullName: u.name, roleId: `role-${def.id}-${u.role}`, departmentId: deptId, passwordHash },
      create: { tenantId: def.id, email: u.email, fullName: u.name, status: "ACTIVE", roleId: `role-${def.id}-${u.role}`, departmentId: deptId, passwordHash },
    });
  }

  // نظافة: أزِل أي أقسام قديمة غير قياسية (بقايا اختبارات) كي تبقى الشجرة القياسية جذرًا واحدًا نظيفًا
  const stale = await prisma.department.findMany({ where: { tenantId: def.id, NOT: { id: { startsWith: `dept-${def.id}-` } } }, select: { id: true } });
  if (stale.length) {
    const ids = stale.map((d) => d.id);
    await prisma.user.updateMany({ where: { departmentId: { in: ids } }, data: { departmentId: null } });
    await prisma.department.updateMany({ where: { id: { in: ids } }, data: { parentId: null } }); // اكسر روابط الأبوّة الذاتية قبل الحذف
    await prisma.department.deleteMany({ where: { id: { in: ids } } });
  }

  let ci = 0;
  for (const c of def.clients) {
    ci++;
    await prisma.client.upsert({
      where: { id: c.id },
      update: { name: c.name, complianceStatus: c.compliance ?? "APPROVED" },
      create: {
        id: c.id,
        tenantId: def.id,
        type: "CORPORATE",
        name: c.name,
        crNumber: c.cr,
        code: `CLI-2026-${1000 + ci}`,
        status: "active",
        complianceStatus: c.compliance ?? "APPROVED",
      },
    });
  }

  for (const cl of def.claims ?? []) {
    await prisma.claim.upsert({
      where: { id: cl.id },
      update: {},
      create: { id: cl.id, tenantId: def.id, sequenceNo: cl.seq },
    });
  }

  for (const w of def.wallets) {
    await prisma.wallet.upsert({
      where: { tenantId_service: { tenantId: def.id, service: w.service } },
      update: { balance: w.balance },
      create: { tenantId: def.id, service: w.service, balance: w.balance },
    });
  }

  // الأساس المحاسبي (المرحلة 4ب): شجرة الحسابات المقفلة + مراكز التكلفة
  await seedFinanceFoundation(def);
}

// شجرة الحسابات القياسية (المستوى 1/2 مقفل — توحيد تقارير هيئة التأمين).
// كود 17 رقماً مبني من المسار الهرمي. فصل داخل/خارج الميزانية لأموال العملاء.
const COA_TEMPLATE: Array<{ path: number[]; name: string; type: string; onBal: boolean }> = [
  { path: [1], name: "الأصول", type: "asset", onBal: true },
  { path: [1, 1], name: "النقد والبنوك", type: "asset", onBal: true },
  { path: [1, 3], name: "ذمم العملاء المدينة", type: "asset", onBal: true },
  { path: [1, 4], name: "ذمم عمولات على شركات التأمين", type: "asset", onBal: true }, // نموذج الدفع المباشر: عمولة تُحصَّل من المؤمِّن
  { path: [1, 5], name: "ضريبة القيمة المضافة — المدخلات (قابلة للاسترداد)", type: "asset", onBal: true },
  { path: [2], name: "الخصوم", type: "liability", onBal: true },
  { path: [2, 1], name: "ذمم شركات التأمين الدائنة", type: "liability", onBal: true },
  { path: [2, 2], name: "أمانات أقساط العملاء (خارج الميزانية)", type: "liability", onBal: false },
  { path: [2, 3], name: "ضريبة القيمة المضافة المستحقة (المخرجات)", type: "liability", onBal: true },
  { path: [3], name: "حقوق الملكية", type: "equity", onBal: true },
  { path: [3, 1], name: "رأس المال", type: "equity", onBal: true },
  { path: [3, 2], name: "الأرباح المُبقاة", type: "equity", onBal: true },
  { path: [4], name: "الإيرادات", type: "revenue", onBal: true },
  { path: [4, 1], name: "عمولات الوساطة", type: "revenue", onBal: true },
  { path: [4, 2], name: "رسوم خدمات وإصدار الوثائق", type: "revenue", onBal: true },
  { path: [5], name: "المصروفات", type: "expense", onBal: true },
  { path: [5, 1], name: "عمولات المنتِجين (الوسطاء الفرعيون)", type: "expense", onBal: true },
  { path: [5, 2], name: "عمولات وحوافز الموظفين", type: "expense", onBal: true },
  { path: [5, 3], name: "الرواتب والأجور", type: "expense", onBal: true },
  { path: [5, 4], name: "الإيجارات", type: "expense", onBal: true },
  { path: [5, 5], name: "المرافق والخدمات", type: "expense", onBal: true },
  { path: [5, 6], name: "التسويق والدعاية", type: "expense", onBal: true },
  { path: [5, 9], name: "مصروفات عمومية أخرى", type: "expense", onBal: true },
];

const coa17 = (path: number[]) => path.map((p) => String(p).padStart(2, "0")).join("").padEnd(17, "0");

async function seedFinanceFoundation(def: TenantDef) {
  for (const a of COA_TEMPLATE) {
    const code = coa17(a.path);
    const level = a.path.length;
    const parentCode = level > 1 ? coa17(a.path.slice(0, -1)) : null;
    const data = {
      name: a.name,
      level,
      isOnBalance: a.onBal,
      isLocked: level < 2, // مستوى 1 (العناوين) فقط مقفل؛ حسابات الترحيل مفتوحة
      accountType: a.type,
      parentId: parentCode ? `coa-${def.id}-${parentCode}` : null,
    };
    await prisma.chartOfAccount.upsert({
      where: { tenantId_code: { tenantId: def.id, code } },
      update: data,
      create: { id: `coa-${def.id}-${code}`, tenantId: def.id, code, ...data },
    });
  }
  // مراكز التكلفة — مستوى 1 = الفروع
  for (const b of def.branches) {
    await prisma.costCenter.upsert({
      where: { tenantId_code: { tenantId: def.id, code: b.code } },
      update: { name: b.name },
      create: { tenantId: def.id, code: b.code, name: b.name, level: 1 },
    });
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
// تاريخ نسبيّ من اليوم (YYYY-MM-DD) — لإبقاء وثائق «المستحقّة للتجديد قريبًا» ضمن نافذة التجديد مهما تقدّم التاريخ (لا تنجرف للماضي).
const dRel = (days: number) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
// مبلغ التأمين (Sum Insured) تقديري من صافي القسط حسب فرع التأمين — القسط نسبة صغيرة من المبلغ المؤمَّن.
const SI_FACTOR: Record<string, number> = {
  MTP: 22, MCI: 22, MOT: 22, // مركبات
  GMI: 4, PMI: 4, MED: 4, // طبي (المبلغ = الحد السنوي)
  PAR: 120, PRO: 120, FIR: 120, ENG: 150, // ممتلكات/هندسي
  MAR: 80, CAR: 90, // بحري/مقاولين
  PL: 60, GL: 60, PI: 60, // مسؤوليات
};
const siOf = (line: string, net: number) => round2(net * (SI_FACTOR[line] ?? 40));

/**
 * بيانات تشغيلية واقعية (وهمية) — تُغذّي واجهات الموظف وبوّابة العميل معاً:
 * وثائق سارية + طلبات + طلبات خدمة + مطالبات + إشعارات مدينة + فواتير + مستندات + مستخدمو بوّابة.
 */
async function seedOperations(passwordHash: string) {
  // وثائق سارية لكل عميل (القسط الصافي → ضريبة 15% → الإجمالي + عمولة الوساطة)
  const policies = [
    { id: "pol-fahd-med", t: "demo-tenant", clientId: "cl-fahd", line: "GMI", insurer: "بوبا العربية", net: 180000, comm: 12.5, start: "2026-01-01", end: "2026-12-31" },
    { id: "pol-fahd-mot", t: "demo-tenant", clientId: "cl-fahd", line: "MCI", insurer: "التعاونية للتأمين", net: 45000, comm: 10, start: "2026-02-01", end: "2027-01-31" },
    { id: "pol-fahd-pro", t: "demo-tenant", clientId: "cl-fahd", line: "PAR", insurer: "وقاية للتأمين", net: 90000, comm: 15, start: "2026-03-01", end: "2027-02-28" },
    { id: "pol-zahra-med", t: "demo-tenant", clientId: "cl-zahra", line: "GMI", insurer: "ملاذ للتأمين", net: 320000, comm: 12, start: "2026-01-15", end: "2027-01-14" },
    { id: "pol-shorouq-mot", t: "demo-tenant", clientId: "cl-shorouq", line: "MCI", insurer: "التعاونية للتأمين", net: 60000, comm: 10, start: dRel(-325), end: dRel(40) }, // مستحقّة للتجديد قريباً (تاريخ نسبيّ — ضمن نافذة الـ60 يومًا دائمًا)
    { id: "pol-nukhba-mot", t: "demo-tenant-2", clientId: "cl2-nukhba", line: "MTP", insurer: "سلامة للتأمين", net: 28000, comm: 8, start: "2026-04-01", end: "2027-03-31" },
  ];
  let pi = 0;
  for (const p of policies) {
    pi++;
    const vat = round2(p.net * 0.15);
    const total = round2(p.net + vat);
    const comm = round2((p.net * p.comm) / 100);
    const commVat = round2(comm * 0.15);
    const fees = pi % 3 === 0 ? 300 : 0; // رسوم خدمة على كل ثالث وثيقة (لعرض التوجيه الصحيح)
    const feesVat = round2(fees * 0.15);
    await prisma.policy.upsert({
      where: { id: p.id },
      update: { insurerName: p.insurer, premium: p.net, vat, totalPremium: total, sumInsured: siOf(p.line, p.net), status: "ISSUED", policyFees: fees, startDate: D(p.start), endDate: D(p.end) },
      create: {
        id: p.id, tenantId: p.t, clientId: p.clientId, productLineCode: p.line, insurerName: p.insurer,
        sequenceNo: `POL-RUH-${p.line}-2026-${1000 + pi}`, premium: p.net, vat, totalPremium: total, sumInsured: siOf(p.line, p.net), policyFees: fees,
        commissionRate: p.comm, commissionAmount: comm, status: "ISSUED",
        startDate: D(p.start), endDate: D(p.end),
      },
    });
    // إشعار المدين يجمع القسط + رسوم الخدمة (مطالبة واحدة على العميل)
    await prisma.debitNote.upsert({
      where: { id: `dn-${p.id}` }, update: { netAmount: round2(p.net + fees), vatAmount: round2(vat + feesVat) },
      create: { id: `dn-${p.id}`, tenantId: p.t, clientId: p.clientId, policyId: p.id, sequenceNo: `DN-2026-${1000 + pi}`, netAmount: round2(p.net + fees), vatAmount: round2(vat + feesVat) },
    });
    // فاتورة ضريبية على المؤمِّن بقيمة العمولة (لا القسط)
    await prisma.invoice.upsert({
      where: { id: `inv-${p.id}` }, update: { kind: "COMMISSION", netAmount: comm, vatAmount: commVat, totalAmount: round2(comm + commVat) },
      create: {
        id: `inv-${p.id}`, tenantId: p.t, kind: "COMMISSION", policyId: p.id, insurerName: p.insurer, sequenceNo: `INV-2026-${1000 + pi}`,
        netAmount: comm, vatAmount: commVat, totalAmount: round2(comm + commVat), status: "issued",
        zatcaUuid: `zatca-${p.id}`, zatcaHash: "demo-hash", qrPayload: "demo-qr",
      },
    });
    // فاتورة ضريبية على العميل برسوم الخدمة (إيراد الوسيط)
    if (fees > 0) await prisma.invoice.upsert({
      where: { id: `inv-fees-${p.id}` }, update: { netAmount: fees, vatAmount: feesVat, totalAmount: round2(fees + feesVat) },
      create: {
        id: `inv-fees-${p.id}`, tenantId: p.t, kind: "FEES", policyId: p.id, clientId: p.clientId, sequenceNo: `INV-2026-${1000 + pi}-F`,
        netAmount: fees, vatAmount: feesVat, totalAmount: round2(fees + feesVat), status: "issued",
        zatcaUuid: `zatca-fees-${p.id}`, zatcaHash: "demo-hash", qrPayload: "demo-qr",
      },
    });
  }

  // طلبات تأمين بمراحل مختلفة (تظهر للموظف والعميل)
  const requests = [
    { id: "req-fahd-eng", t: "demo-tenant", clientId: "cl-fahd", line: "CAR", status: "QUOTING", seq: "SL-RUH-CAR-2026-2001" },
    { id: "req-fahd-mar", t: "demo-tenant", clientId: "cl-fahd", line: "MCG", status: "DRAFT", seq: "SL-RUH-MCG-2026-2002" },
    { id: "req-zahra-life", t: "demo-tenant", clientId: "cl-zahra", line: "GLI", status: "AWARDED", seq: "SL-RUH-GLI-2026-2003" },
    { id: "req-wahah-fire", t: "demo-tenant", clientId: "cl-wahah", line: "FIR", status: "UNDER_REVIEW", seq: "SL-RUH-FIR-2026-2004" },
  ];
  for (const r of requests) {
    await prisma.policyRequest.upsert({
      where: { id: r.id }, update: { status: r.status as never },
      create: { id: r.id, tenantId: r.t, clientId: r.clientId, productLineCode: r.line, status: r.status as never, sequenceNo: r.seq, base: {} },
    });
  }

  // طلبات خدمة العملاء
  const services = [
    { id: "svc-fahd-add", t: "demo-tenant", clientId: "cl-fahd", policyId: "pol-fahd-med", type: "addition", subject: "إضافة 3 موظفين للوثيقة الطبية", status: "IN_PROGRESS", seq: "RQ-2026-3001" },
    { id: "svc-fahd-inq", t: "demo-tenant", clientId: "cl-fahd", policyId: "pol-fahd-mot", type: "inquiry", subject: "استفسار عن حدود تغطية المركبات", status: "CLOSED", seq: "RQ-2026-3002" },
  ];
  for (const s of services) {
    await prisma.serviceRequest.upsert({
      where: { id: s.id }, update: {},
      create: { id: s.id, tenantId: s.t, clientId: s.clientId, policyId: s.policyId, type: s.type, subject: s.subject, status: s.status as never, sequenceNo: s.seq },
    });
  }

  // مطالبات (إثراء المطالبة المزروعة + إضافة جديدة)
  const claims = [
    { id: "claim-t1-1", t: "demo-tenant", clientId: "cl-fahd", policyId: "pol-fahd-mot", insurer: "التعاونية للتأمين", incident: "2026-03-12", claimed: 12000, deduct: 1000, settled: null, status: "UNDER_REVIEW", seq: "CL-RUH-2026-0001" },
    { id: "claim-t1-2", t: "demo-tenant", clientId: "cl-fahd", policyId: "pol-fahd-med", insurer: "بوبا العربية", incident: "2026-02-20", claimed: 9500, deduct: 500, settled: 8500, status: "SETTLED", seq: "CL-RUH-2026-0002" },
    { id: "claim-t1-3", t: "demo-tenant", clientId: "cl-zahra", policyId: "pol-zahra-med", insurer: "ملاذ للتأمين", incident: "2026-04-05", claimed: 22000, deduct: 2000, settled: null, status: "SUBMITTED", seq: "CL-RUH-2026-0003" },
  ];
  for (const c of claims) {
    await prisma.claim.upsert({
      where: { id: c.id },
      update: { clientId: c.clientId, policyId: c.policyId, insurerName: c.insurer, claimedAmount: c.claimed, deductible: c.deduct, settledAmount: c.settled ?? null, status: c.status as never, incidentDate: D(c.incident) },
      create: { id: c.id, tenantId: c.t, clientId: c.clientId, policyId: c.policyId, insurerName: c.insurer, claimedAmount: c.claimed, deductible: c.deduct, settledAmount: c.settled ?? null, status: c.status as never, incidentDate: D(c.incident), sequenceNo: c.seq },
    });
  }

  // مستندات (بيانات وصفية — العرض عبر رابط موقّت في البوّابة)
  const docs = [
    { id: "doc-fahd-med-sched", t: "demo-tenant", entityType: "policy", entityId: "pol-fahd-med", fileName: "جدول الوثيقة الطبية.pdf", docType: "OFFICIAL" },
    { id: "doc-fahd-mot-cert", t: "demo-tenant", entityType: "policy", entityId: "pol-fahd-mot", fileName: "شهادة تأمين المركبات.pdf", docType: "OFFICIAL" },
    { id: "doc-fahd-claim", t: "demo-tenant", entityType: "claim", entityId: "claim-t1-1", fileName: "نموذج المطالبة.pdf", docType: "ATTACHMENT" },
    { id: "doc-fahd-profile", t: "demo-tenant", entityType: "client", entityId: "cl-fahd", fileName: "السجل التجاري.pdf", docType: "ATTACHMENT" },
  ];
  for (const d of docs) {
    await prisma.document.upsert({
      where: { id: d.id }, update: {},
      create: { id: d.id, tenantId: d.t, storageKey: `${d.t}/seed/${d.id}.pdf`, fileName: d.fileName, mime: "application/pdf", sizeBytes: 124000, hash: "seed", docType: d.docType as never, entityType: d.entityType, entityId: d.entityId },
    });
  }

  // عمليات تحقّق (KYC/KYB + فحص PEP) — تغذّي لوحة الالتزام
  const provs = Object.fromEntries((await prisma.verificationProvider.findMany({ select: { id: true, key: true } })).map((p) => [p.key, p.id]));
  const checks = [
    { id: "chk-fahd-id", clientId: "cl-fahd", key: "yaqeen", checkType: "identity", status: "success", risk: null },
    { id: "chk-fahd-cr", clientId: "cl-fahd", key: "wathiq", checkType: "cr", status: "success", risk: null },
    { id: "chk-fahd-pep", clientId: "cl-fahd", key: "screening", checkType: "pep_sanctions", status: "success", risk: "low" },
    { id: "chk-zahra-pep", clientId: "cl-zahra", key: "screening", checkType: "pep_sanctions", status: "success", risk: "medium" },
    { id: "chk-manara-pep", clientId: "cl-manara", key: "screening", checkType: "pep_sanctions", status: "success", risk: "high" },
    { id: "chk-shorouq-addr", clientId: "cl-shorouq", key: "spl", checkType: "address", status: "success", risk: null },
  ];
  for (const c of checks) {
    if (!provs[c.key]) continue;
    await prisma.verificationCheck.upsert({
      where: { id: c.id }, update: {},
      create: { id: c.id, tenantId: "demo-tenant", providerId: provs[c.key], checkType: c.checkType, status: c.status, clientId: c.clientId, riskLevel: c.risk, cost: c.key === "spl" ? 0 : 3 },
    });
  }

  // قيود العمولات (أساس تقرير العمولات) — حالات مختلطة: مستلمة/مستحقّة/فرق
  const commissions = [
    { id: "com-fahd-med", t: "demo-tenant", policyId: "pol-fahd-med", insurer: "بوبا العربية", client: "شركة الفهد للمقاولات", line: "GMI", rate: 12.5, amount: 22500, received: 22500, status: "received", period: "2026-01" },
    { id: "com-fahd-mot", t: "demo-tenant", policyId: "pol-fahd-mot", insurer: "التعاونية للتأمين", client: "شركة الفهد للمقاولات", line: "MCI", rate: 10, amount: 4500, received: null, status: "accrued", period: "2026-02" },
    { id: "com-fahd-pro", t: "demo-tenant", policyId: "pol-fahd-pro", insurer: "وقاية للتأمين", client: "شركة الفهد للمقاولات", line: "PAR", rate: 15, amount: 13500, received: 12000, status: "variance", period: "2026-03" },
    { id: "com-zahra-med", t: "demo-tenant", policyId: "pol-zahra-med", insurer: "ملاذ للتأمين", client: "مجموعة الزهراء الطبية", line: "GMI", rate: 12, amount: 38400, received: 38400, status: "received", period: "2026-01" },
    { id: "com-nukhba-mot", t: "demo-tenant-2", policyId: "pol-nukhba-mot", insurer: "سلامة للتأمين", client: "مؤسسة النخبة التجارية", line: "MTP", rate: 8, amount: 2240, received: null, status: "accrued", period: "2026-04" },
  ];
  for (const c of commissions) {
    await prisma.commission.upsert({
      where: { id: c.id }, update: {},
      create: { id: c.id, tenantId: c.t, policyId: c.policyId, insurerName: c.insurer, clientName: c.client, productLine: c.line, rate: c.rate, amount: c.amount, receivedAmount: c.received ?? null, status: c.status, periodMonth: c.period },
    });
  }

  // مستخدمو بوّابة العميل (نطاق client)
  const portalUsers = [
    { id: "cu-fahd", t: "demo-tenant", clientId: "cl-fahd", email: "portal@alfahd.sa", name: "إدارة شركة الفهد" },
    { id: "cu-nukhba", t: "demo-tenant-2", clientId: "cl2-nukhba", email: "portal@nukhba.sa", name: "مؤسسة النخبة التجارية" },
  ];
  for (const u of portalUsers) {
    await prisma.clientUser.upsert({
      where: { email: u.email }, update: { fullName: u.name, passwordHash },
      create: { id: u.id, tenantId: u.t, clientId: u.clientId, email: u.email, fullName: u.name, passwordHash },
    });
  }
}

// شركات تأمين سعودية واقعية (للتنويع في الإنتاج والعمولات).
const INSURERS = [
  "شركة التعاونية للتأمين", "بوبا العربية للتأمين", "شركة ملاذ للتأمين", "شركة سلامة للتأمين",
  "شركة الدرع العربي للتأمين", "المتوسط والخليج للتأمين (ميدغلف)", "gig الخليج للتأمين", "الإنماء طوكيو مارين",
  "شركة عناية السعودية للتأمين", "شركة الصقر للتأمين", "تكافل الراجحي", "شركة الاتحاد للتأمين",
  "الشركة المتحدة للتأمين (ولاء)", "شركة بروج للتأمين", "شركة الوطنية للتأمين", "أمانة للتأمين",
];

/**
 * بيانات شبه واقعية واسعة عبر كل المنصّة (إضافية — معرّفات جديدة لا تمسّ كيانات الاختبارات
 * cl-fahd/cl2-nukhba). تملأ: عملاء، وثائق سارية ومالية مشتقّة، طلبات وعروض أسعار،
 * خدمة، مطالبات، تحقّق KYC/PEP، مستندات، ملاحق، ومستخدمي بوّابة.
 */
async function seedRichData(passwordHash: string) {
  // ---- سجلّ شركات التأمين (المؤمِّنون) بنِسبهم — يظهر في صفحة المؤمِّنين، وتُعبَّأ نسبة العمولة منه تلقائيًا في التسعير ----
  // الأسماء تطابق insurerName على الوثائق فتظهر إحصاءات الإنتاج، وتظهر في القائمة المنسدلة عند إضافة عرض.
  const insurerDefs = [
    { id: "ins-dt-tw", t: "demo-tenant", name: "التعاونية للتأمين", nameEn: "Tawuniya", commissionRate: 10, settlementDays: 60, licenseNo: "IA-INS-2019-001", vatNumber: "300000000000013", bankName: "الراجحي", iban: "SA0380000000608010101010", contactEmail: "underwriting@tawuniya.demo.sa" },
    { id: "ins-dt-bupa", t: "demo-tenant", name: "بوبا العربية", nameEn: "Bupa Arabia", commissionRate: 12.5, settlementDays: 45, licenseNo: "IA-INS-2019-002", vatNumber: "300000000000023", bankName: "الأهلي", iban: "SA0380000000608010202020", contactEmail: "underwriting@bupa.demo.sa" },
    { id: "ins-dt-malath", t: "demo-tenant", name: "ملاذ للتأمين", nameEn: "Malath", commissionRate: 12, settlementDays: 90, licenseNo: "IA-INS-2019-003", contactEmail: "underwriting@malath.demo.sa" },
    { id: "ins-dt-wiqaya", t: "demo-tenant", name: "وقاية للتأمين", nameEn: "Wiqaya", commissionRate: 15, settlementDays: 60, licenseNo: "IA-INS-2019-004" },
    { id: "ins-dt-walaa", t: "demo-tenant", name: "الاتحاد للتأمين (ولاء)", nameEn: "Walaa", commissionRate: 13.5, settlementDays: 60, licenseNo: "IA-INS-2019-005", contactEmail: "underwriting@walaa.demo.sa" },
    { id: "ins-dt2-salama", t: "demo-tenant-2", name: "سلامة للتأمين", nameEn: "Salama", commissionRate: 8, settlementDays: 45, licenseNo: "IA-INS-2019-006", contactEmail: "underwriting@salama.demo.sa" },
    { id: "ins-dt2-gig", t: "demo-tenant-2", name: "gig الخليج للتأمين", nameEn: "GIG Gulf", commissionRate: 11, settlementDays: 60, licenseNo: "IA-INS-2019-007", contactEmail: "underwriting@gig.demo.sa" },
  ];
  for (const ins of insurerDefs) {
    const { t, ...rest } = ins;
    await prisma.insurer.upsert({
      where: { id: ins.id },
      update: { commissionRate: ins.commissionRate, settlementDays: ins.settlementDays, status: "active" },
      create: { tenantId: t, status: "active", ...rest },
    });
  }

  // ---- عملاء إضافيون واقعيون ----
  const clients: Array<{ id: string; t: string; name: string; id2: string; type: "CORPORATE" | "INDIVIDUAL"; city: string; email: string; phone: string; compliance: "APPROVED" | "PENDING" | "REJECTED" }> = [
    { id: "cl-redsea", t: "demo-tenant", name: "شركة البحر الأحمر للتطوير", id2: "4030112233", type: "CORPORATE", city: "جدة", email: "info@redsea-dev.sa", phone: "0126540011", compliance: "APPROVED" },
    { id: "cl-rowad", t: "demo-tenant", name: "مصنع الرواد للبلاستيك", id2: "1010334455", type: "CORPORATE", city: "الرياض", email: "ops@rowad-plastic.sa", phone: "0114220033", compliance: "APPROVED" },
    { id: "cl-naseej", t: "demo-tenant", name: "مجموعة نسيج القابضة", id2: "1010556677", type: "CORPORATE", city: "الرياض", email: "corp@naseej-holding.sa", phone: "0112998800", compliance: "APPROVED" },
    { id: "cl-darb", t: "demo-tenant", name: "درب الحرير اللوجستية", id2: "2050778899", type: "CORPORATE", city: "الدمام", email: "logistics@silkroad.sa", phone: "0138110022", compliance: "PENDING" },
    { id: "cl-salamah", t: "demo-tenant", name: "مستشفى السلامة التخصصي", id2: "4030991122", type: "CORPORATE", city: "جدة", email: "admin@salamah-hospital.sa", phone: "0126710099", compliance: "APPROVED" },
    { id: "cl-emaar", t: "demo-tenant", name: "مقاولات الإعمار الحديثة", id2: "1010223344", type: "CORPORATE", city: "الرياض", email: "pm@emaar-modern.sa", phone: "0114550066", compliance: "APPROVED" },
    { id: "cl-taif", t: "demo-tenant", name: "شركة طيف للتقنية", id2: "1010445566", type: "CORPORATE", city: "الرياض", email: "hello@taif-tech.sa", phone: "0112334455", compliance: "APPROVED" },
    { id: "cl-aseel", t: "demo-tenant", name: "مجموعة الأصيل التجارية", id2: "3040667788", type: "CORPORATE", city: "مكة", email: "trade@aseel-group.sa", phone: "0125660077", compliance: "APPROVED" },
    { id: "cl-khazaf", t: "demo-tenant", name: "مصانع الخزف السعودي", id2: "2050889900", type: "CORPORATE", city: "الخبر", email: "factory@saudi-ceramics.sa", phone: "0138990011", compliance: "REJECTED" },
    { id: "cl-abdullah", t: "demo-tenant", name: "عبدالله محمد الشمري", id2: "1098765432", type: "INDIVIDUAL", city: "الرياض", email: "a.alshammari@email.sa", phone: "0551122334", compliance: "APPROVED" },
    { id: "cl-fatima", t: "demo-tenant", name: "فاطمة سعد القحطاني", id2: "1087654321", type: "INDIVIDUAL", city: "أبها", email: "f.alqahtani@email.sa", phone: "0567788990", compliance: "APPROVED" },
    // المستأجر الثاني
    { id: "cl2-rimal", t: "demo-tenant-2", name: "شركة رمال للعقارات", id2: "3050112233", type: "CORPORATE", city: "جدة", email: "info@rimal-realestate.sa", phone: "0126112233", compliance: "APPROVED" },
    { id: "cl2-khair", t: "demo-tenant-2", name: "مزارع الخير الزراعية", id2: "3050334455", type: "CORPORATE", city: "المدينة", email: "farm@alkhair-agri.sa", phone: "0148445566", compliance: "APPROVED" },
    { id: "cl2-lulu", t: "demo-tenant-2", name: "فندق اللؤلؤة", id2: "3050556677", type: "CORPORATE", city: "مكة", email: "stay@allulu-hotel.sa", phone: "0125667788", compliance: "PENDING" },
  ];
  const nameOf: Record<string, string> = { "cl-zahra": "مجموعة الزهراء الطبية", "cl-manara": "منارة تك", "cl-shorouq": "الشروق للنقل والتجارة", "cl-wahah": "أغذية الواحة" };
  let ci = 2000;
  for (const c of clients) {
    ci++;
    nameOf[c.id] = c.name;
    await prisma.client.upsert({
      where: { id: c.id }, update: { name: c.name, city: c.city, email: c.email, complianceStatus: c.compliance, collectionModel: (c as { collect?: string }).collect ?? "collect_full" },
      create: { id: c.id, tenantId: c.t, type: c.type, name: c.name, crNumber: c.type === "CORPORATE" ? c.id2 : null, nationalId: c.type === "INDIVIDUAL" ? c.id2 : null, email: c.email, phone: c.phone, city: c.city, code: `CLI-2026-${ci}`, status: "active", complianceStatus: c.compliance },
    });
  }

  // ---- وثائق سارية + إشعار مدين + فاتورة + عمولة لكل وثيقة سارية ----
  const policies: Array<{ id: string; t: string; clientId: string; line: string; ins: number; net: number; comm: number; start: string; end: string; status: string }> = [
    { id: "rp-redsea-pro", t: "demo-tenant", clientId: "cl-redsea", line: "PAR", ins: 5, net: 240000, comm: 14, start: "2026-01-10", end: "2027-01-09", status: "ISSUED" },
    { id: "rp-redsea-eng", t: "demo-tenant", clientId: "cl-redsea", line: "CAR", ins: 7, net: 410000, comm: 16, start: "2026-02-15", end: "2027-08-14", status: "ISSUED" },
    { id: "rp-rowad-pro", t: "demo-tenant", clientId: "cl-rowad", line: "FIR", ins: 2, net: 130000, comm: 12.5, start: "2026-03-01", end: "2027-02-28", status: "ISSUED" },
    { id: "rp-rowad-mot", t: "demo-tenant", clientId: "cl-rowad", line: "MCI", ins: 0, net: 88000, comm: 10, start: "2026-04-20", end: "2027-04-19", status: "ISSUED" },
    { id: "rp-naseej-med", t: "demo-tenant", clientId: "cl-naseej", line: "GMI", ins: 1, net: 520000, comm: 11, start: "2026-01-01", end: "2026-12-31", status: "ISSUED" },
    { id: "rp-naseej-life", t: "demo-tenant", clientId: "cl-naseej", line: "GLI", ins: 10, net: 145000, comm: 9, start: "2026-05-01", end: "2027-04-30", status: "ISSUED" },
    { id: "rp-salamah-med", t: "demo-tenant", clientId: "cl-salamah", line: "GMI", ins: 1, net: 680000, comm: 12, start: "2026-02-01", end: "2027-01-31", status: "ISSUED" },
    { id: "rp-salamah-pli", t: "demo-tenant", clientId: "cl-salamah", line: "PLI", ins: 13, net: 95000, comm: 15, start: "2026-06-01", end: "2026-07-20", status: "ISSUED" },
    { id: "rp-emaar-eng", t: "demo-tenant", clientId: "cl-emaar", line: "EAR", ins: 6, net: 360000, comm: 16, start: "2026-03-15", end: "2027-09-14", status: "ISSUED" },
    { id: "rp-emaar-mot", t: "demo-tenant", clientId: "cl-emaar", line: "MTP", ins: 3, net: 52000, comm: 8, start: "2026-06-10", end: "2026-07-09", status: "ISSUED" },
    { id: "rp-aseel-mar", t: "demo-tenant", clientId: "cl-aseel", line: "MCG", ins: 8, net: 175000, comm: 13, start: "2026-04-01", end: "2027-03-31", status: "ISSUED" },
    { id: "rp-taif-med", t: "demo-tenant", clientId: "cl-taif", line: "GMI", ins: 1, net: 210000, comm: 11.5, start: "2026-01-20", end: "2027-01-19", status: "ISSUED" },
    { id: "rp-abdullah-mot", t: "demo-tenant", clientId: "cl-abdullah", line: "MCI", ins: 0, net: 9800, comm: 10, start: "2026-05-15", end: "2027-05-14", status: "ISSUED" },
    { id: "rp-fatima-trv", t: "demo-tenant", clientId: "cl-fatima", line: "TRV", ins: 14, net: 1800, comm: 20, start: "2026-06-15", end: "2026-12-15", status: "ISSUED" },
    { id: "rp-khazaf-pro", t: "demo-tenant", clientId: "cl-khazaf", line: "PAR", ins: 5, net: 150000, comm: 13, start: "2026-06-20", end: "2027-06-19", status: "TECHNICAL_REVIEW" },
    { id: "rp-darb-mot", t: "demo-tenant", clientId: "cl-darb", line: "MCI", ins: 11, net: 120000, comm: 10, start: "2026-06-18", end: "2027-06-17", status: "FINANCE_REVIEW" },
    // المستأجر الثاني
    { id: "rp2-rimal-pro", t: "demo-tenant-2", clientId: "cl2-rimal", line: "PAR", ins: 4, net: 96000, comm: 12, start: "2026-03-05", end: "2027-03-04", status: "ISSUED" },
    { id: "rp2-khair-gen", t: "demo-tenant-2", clientId: "cl2-khair", line: "GPA", ins: 9, net: 34000, comm: 10, start: "2026-04-12", end: "2027-04-11", status: "ISSUED" },
    { id: "rp2-lulu-pro", t: "demo-tenant-2", clientId: "cl2-lulu", line: "FIR", ins: 2, net: 72000, comm: 11, start: "2026-06-12", end: "2026-07-11", status: "ISSUED" },
  ];
  let sp = 3000;
  for (const p of policies) {
    sp++;
    const vat = round2(p.net * 0.15), total = round2(p.net + vat), comm = round2((p.net * p.comm) / 100);
    await prisma.policy.upsert({
      where: { id: p.id }, update: { status: p.status as never, sumInsured: siOf(p.line, p.net) },
      create: { id: p.id, tenantId: p.t, clientId: p.clientId, productLineCode: p.line, insurerName: INSURERS[p.ins], sequenceNo: `POL-RUH-${p.line}-2026-${sp}`, premium: p.net, vat, totalPremium: total, sumInsured: siOf(p.line, p.net), commissionRate: p.comm, commissionAmount: comm, status: p.status as never, startDate: D(p.start), endDate: D(p.end) },
    });
    if (p.status !== "ISSUED") continue;
    const commVat = round2(comm * 0.15);
    await prisma.debitNote.upsert({ where: { id: `dn-${p.id}` }, update: {}, create: { id: `dn-${p.id}`, tenantId: p.t, clientId: p.clientId, policyId: p.id, sequenceNo: `DN-2026-${sp}`, netAmount: p.net, vatAmount: vat } });
    await prisma.invoice.upsert({ where: { id: `inv-${p.id}` }, update: { kind: "COMMISSION", netAmount: comm, vatAmount: commVat, totalAmount: round2(comm + commVat) }, create: { id: `inv-${p.id}`, tenantId: p.t, kind: "COMMISSION", policyId: p.id, insurerName: INSURERS[p.ins], sequenceNo: `INV-2026-${sp}`, netAmount: comm, vatAmount: commVat, totalAmount: round2(comm + commVat), status: "issued", zatcaUuid: `zatca-${p.id}`, zatcaHash: "demo-hash", qrPayload: "demo-qr" } });
    const st = ["received", "accrued", "variance"][sp % 3];
    const recv = st === "received" ? comm : st === "variance" ? round2(comm * 0.9) : null;
    await prisma.commission.upsert({ where: { id: `com-${p.id}` }, update: {}, create: { id: `com-${p.id}`, tenantId: p.t, policyId: p.id, insurerName: INSURERS[p.ins], clientName: nameOf[p.clientId] ?? "—", productLine: p.line, rate: p.comm, amount: comm, receivedAmount: recv, status: st, periodMonth: p.start.slice(0, 7) } });
  }

  // ---- طلبات في مراحل مختلفة + عروض أسعار (RFQ) للطلبات في مرحلة التسعير ----
  const reqs: Array<{ id: string; t: string; clientId: string; line: string; status: string; seq: string; quote?: number[] }> = [
    { id: "rr-naseej-mot", t: "demo-tenant", clientId: "cl-naseej", line: "MCI", status: "QUOTING", seq: "SL-RUH-MCI-2026-4001", quote: [0, 3, 11] },
    { id: "rr-aseel-pro", t: "demo-tenant", clientId: "cl-aseel", line: "PAR", status: "QUOTING", seq: "SL-RUH-PAR-2026-4002", quote: [5, 2, 13] },
    { id: "rr-taif-life", t: "demo-tenant", clientId: "cl-taif", line: "GLI", status: "QUOTING", seq: "SL-RUH-GLI-2026-4003", quote: [10, 1, 14] },
    { id: "rr-rowad-mar", t: "demo-tenant", clientId: "cl-rowad", line: "MCG", status: "DRAFT", seq: "SL-RUH-MCG-2026-4004" },
    { id: "rr-emaar-gpa", t: "demo-tenant", clientId: "cl-emaar", line: "GPA", status: "AWARDED", seq: "SL-RUH-GPA-2026-4005" },
    { id: "rr-redsea-med", t: "demo-tenant", clientId: "cl-redsea", line: "GMI", status: "UNDER_REVIEW", seq: "SL-RUH-GMI-2026-4006" },
    { id: "rr-darb-eng", t: "demo-tenant", clientId: "cl-darb", line: "EAR", status: "REJECTED", seq: "SL-RUH-EAR-2026-4007" },
    { id: "rr2-rimal-mot", t: "demo-tenant-2", clientId: "cl2-rimal", line: "MTP", status: "QUOTING", seq: "SL-JED-MTP-2026-4008", quote: [3, 4, 9] },
  ];
  let sq = 5000;
  for (const r of reqs) {
    await prisma.policyRequest.upsert({ where: { id: r.id }, update: { status: r.status as never }, create: { id: r.id, tenantId: r.t, clientId: r.clientId, productLineCode: r.line, status: r.status as never, sequenceNo: r.seq, base: {} } });
    if (!r.quote) continue;
    const slipId = `slip-${r.id}`;
    await prisma.slip.upsert({ where: { id: slipId }, update: {}, create: { id: slipId, tenantId: r.t, requestId: r.id, sequenceNo: `RFQ-${r.line}-2026-${sq}`, insurers: r.quote.map((i) => INSURERS[i]), notes: "طلب عروض أسعار — مقارنة فنية وسعرية" } });
    let qi = 0;
    for (const ins of r.quote) {
      qi++; sq++;
      const net = 40000 + ins * 7000 + qi * 5000;
      const vat = round2(net * 0.15);
      await prisma.quotation.upsert({
        where: { id: `q-${r.id}-${qi}` }, update: {},
        create: { id: `q-${r.id}-${qi}`, tenantId: r.t, slipId, insurerName: INSURERS[ins], rate: 2 + qi * 0.5, premium: net, vat, totalPremium: round2(net + vat), deductible: 1000 * qi, limit: 1000000 * qi, validUntil: D("2026-08-31"), generalRemarks: "شامل التغطيات الأساسية", additionalConditions: qi === 2 ? "خصم عدم مطالبات 10%" : null },
      });
    }
  }

  // ---- طلبات خدمة العملاء ----
  const svcs = [
    { id: "rs-naseej-add", t: "demo-tenant", clientId: "cl-naseej", policyId: "rp-naseej-med", type: "addition", subject: "إضافة 12 موظفاً جديداً للوثيقة الطبية", status: "IN_PROGRESS", seq: "RQ-2026-5001" },
    { id: "rs-salamah-amd", t: "demo-tenant", clientId: "cl-salamah", policyId: "rp-salamah-med", type: "amendment", subject: "رفع حد التغطية للفئة A", status: "SENT_TO_INSURER", seq: "RQ-2026-5002" },
    { id: "rs-emaar-del", t: "demo-tenant", clientId: "cl-emaar", policyId: "rp-emaar-eng", type: "deletion", subject: "حذف معدّة من وثيقة التركيب", status: "CLOSED", seq: "RQ-2026-5003" },
    { id: "rs-aseel-inq", t: "demo-tenant", clientId: "cl-aseel", policyId: "rp-aseel-mar", type: "inquiry", subject: "استفسار عن استثناءات الشحن البحري", status: "OPEN", seq: "RQ-2026-5004" },
    { id: "rs-redsea-ren", t: "demo-tenant", clientId: "cl-redsea", policyId: "rp-redsea-pro", type: "renewal", subject: "طلب تجديد وثيقة الممتلكات", status: "OPEN", seq: "RQ-2026-5005" },
    { id: "rs2-rimal-add", t: "demo-tenant-2", clientId: "cl2-rimal", policyId: "rp2-rimal-pro", type: "addition", subject: "إضافة موقع جديد للتغطية", status: "IN_PROGRESS", seq: "RQ-2026-5006" },
  ];
  for (const s of svcs) {
    await prisma.serviceRequest.upsert({ where: { id: s.id }, update: {}, create: { id: s.id, tenantId: s.t, clientId: s.clientId, policyId: s.policyId, type: s.type, subject: s.subject, status: s.status as never, sequenceNo: s.seq } });
  }

  // ---- مطالبات متنوّعة (ليست على cl-fahd) ----
  const claims = [
    { id: "rc-naseej-med", t: "demo-tenant", clientId: "cl-naseej", policyId: "rp-naseej-med", ins: 1, incident: "2026-03-22", claimed: 18500, deduct: 1500, settled: 15000, status: "SETTLED", seq: "CL-RUH-2026-1101" },
    { id: "rc-rowad-fire", t: "demo-tenant", clientId: "cl-rowad", policyId: "rp-rowad-pro", ins: 2, incident: "2026-04-30", claimed: 240000, deduct: 25000, settled: null, status: "UNDER_REVIEW", seq: "CL-RUH-2026-1102" },
    { id: "rc-emaar-eng", t: "demo-tenant", clientId: "cl-emaar", policyId: "rp-emaar-eng", ins: 6, incident: "2026-05-11", claimed: 95000, deduct: 10000, settled: null, status: "SUBMITTED", seq: "CL-RUH-2026-1103" },
    { id: "rc-aseel-mar", t: "demo-tenant", clientId: "cl-aseel", policyId: "rp-aseel-mar", ins: 8, incident: "2026-05-28", claimed: 62000, deduct: 5000, settled: null, status: "RECEIVED", seq: "CL-RUH-2026-1104" },
    { id: "rc-abdullah-mot", t: "demo-tenant", clientId: "cl-abdullah", policyId: "rp-abdullah-mot", ins: 0, incident: "2026-06-02", claimed: 7400, deduct: 500, settled: 6900, status: "SETTLED", seq: "CL-RUH-2026-1105" },
    { id: "rc-salamah-pli", t: "demo-tenant", clientId: "cl-salamah", policyId: "rp-salamah-pli", ins: 13, incident: "2026-06-09", claimed: 33000, deduct: 3000, settled: null, status: "REJECTED", seq: "CL-RUH-2026-1106" },
    { id: "rc2-rimal-pro", t: "demo-tenant-2", clientId: "cl2-rimal", policyId: "rp2-rimal-pro", ins: 4, incident: "2026-05-19", claimed: 41000, deduct: 4000, settled: 30000, status: "SETTLED", seq: "CL-JED-2026-1107" },
  ];
  for (const c of claims) {
    await prisma.claim.upsert({
      where: { id: c.id }, update: {},
      create: { id: c.id, tenantId: c.t, clientId: c.clientId, policyId: c.policyId, insurerName: INSURERS[c.ins], claimedAmount: c.claimed, deductible: c.deduct, settledAmount: c.settled ?? null, status: c.status as never, incidentDate: D(c.incident), sequenceNo: c.seq },
    });
  }

  // ---- عمليات تحقّق إضافية (KYC/KYB + PEP) ----
  const provs = Object.fromEntries((await prisma.verificationProvider.findMany({ select: { id: true, key: true } })).map((p) => [p.key, p.id]));
  const checks = [
    { id: "rk-redsea-cr", clientId: "cl-redsea", key: "wathiq", checkType: "cr", risk: null },
    { id: "rk-naseej-pep", clientId: "cl-naseej", key: "screening", checkType: "pep_sanctions", risk: "low" },
    { id: "rk-salamah-pep", clientId: "cl-salamah", key: "screening", checkType: "pep_sanctions", risk: "low" },
    { id: "rk-darb-pep", clientId: "cl-darb", key: "screening", checkType: "pep_sanctions", risk: "medium" },
    { id: "rk-khazaf-pep", clientId: "cl-khazaf", key: "screening", checkType: "pep_sanctions", risk: "high" },
    { id: "rk-abdullah-id", clientId: "cl-abdullah", key: "yaqeen", checkType: "identity", risk: null },
    { id: "rk-fatima-id", clientId: "cl-fatima", key: "yaqeen", checkType: "identity", risk: null },
    { id: "rk-emaar-addr", clientId: "cl-emaar", key: "spl", checkType: "address", risk: null },
    { id: "rk-aseel-cr", clientId: "cl-aseel", key: "wathiq", checkType: "cr", risk: null },
  ];
  for (const c of checks) {
    if (!provs[c.key]) continue;
    await prisma.verificationCheck.upsert({ where: { id: c.id }, update: {}, create: { id: c.id, tenantId: "demo-tenant", providerId: provs[c.key], checkType: c.checkType, status: "success", clientId: c.clientId, riskLevel: c.risk, cost: c.key === "spl" ? 0 : 3 } });
  }

  // ---- ملاحق على وثائق سارية ----
  const ends = [
    { id: "re-naseej-1", t: "demo-tenant", policyId: "rp-naseej-med", type: "addition", seq: "POL-RUH-GMI-2026-3005/E1", delta: 45000, eff: "2026-04-01" },
    { id: "re-salamah-1", t: "demo-tenant", policyId: "rp-salamah-med", type: "amendment", seq: "POL-RUH-GMI-2026-3007/E1", delta: 12000, eff: "2026-05-15" },
    { id: "re-emaar-1", t: "demo-tenant", policyId: "rp-emaar-eng", type: "deletion", seq: "POL-RUH-EAR-2026-3009/E1", delta: -8000, eff: "2026-06-01" },
  ];
  for (const e of ends) {
    await prisma.endorsement.upsert({ where: { id: e.id }, update: {}, create: { id: e.id, tenantId: e.t, policyId: e.policyId, type: e.type, sequenceNo: e.seq, premiumDelta: e.delta, effectiveDate: D(e.eff) } });
  }

  // ---- مستندات إضافية ----
  const docs = [
    { id: "rd-naseej-sched", t: "demo-tenant", entityType: "policy", entityId: "rp-naseej-med", fileName: "جدول الوثيقة الطبية — نسيج.pdf", docType: "OFFICIAL" },
    { id: "rd-redsea-cert", t: "demo-tenant", entityType: "policy", entityId: "rp-redsea-pro", fileName: "شهادة تأمين الممتلكات.pdf", docType: "OFFICIAL" },
    { id: "rd-emaar-eng", t: "demo-tenant", entityType: "policy", entityId: "rp-emaar-eng", fileName: "وثيقة جميع أخطار التركيب.pdf", docType: "OFFICIAL" },
    { id: "rd-rowad-claim", t: "demo-tenant", entityType: "claim", entityId: "rc-rowad-fire", fileName: "تقرير معاينة الحريق.pdf", docType: "ATTACHMENT" },
    { id: "rd-naseej-cr", t: "demo-tenant", entityType: "client", entityId: "cl-naseej", fileName: "السجل التجاري — نسيج.pdf", docType: "ATTACHMENT" },
    { id: "rd-aseel-mar", t: "demo-tenant", entityType: "policy", entityId: "rp-aseel-mar", fileName: "بوليصة الشحن البحري.pdf", docType: "OFFICIAL" },
  ];
  for (const d of docs) {
    await prisma.document.upsert({ where: { id: d.id }, update: {}, create: { id: d.id, tenantId: d.t, storageKey: `${d.t}/seed/${d.id}.pdf`, fileName: d.fileName, mime: "application/pdf", sizeBytes: 138000, hash: "seed", docType: d.docType as never, entityType: d.entityType, entityId: d.entityId } });
  }

  // ---- مستخدمو بوّابة لعملاء إضافيين ----
  const portalUsers = [
    { id: "rcu-naseej", t: "demo-tenant", clientId: "cl-naseej", email: "portal@naseej.sa", name: "إدارة مجموعة نسيج" },
    { id: "rcu-salamah", t: "demo-tenant", clientId: "cl-salamah", email: "portal@salamah-hospital.sa", name: "مستشفى السلامة" },
    { id: "rcu-redsea", t: "demo-tenant", clientId: "cl-redsea", email: "portal@redsea-dev.sa", name: "البحر الأحمر للتطوير" },
    { id: "rcu2-rimal", t: "demo-tenant-2", clientId: "cl2-rimal", email: "portal@rimal.sa", name: "رمال للعقارات" },
  ];
  for (const u of portalUsers) {
    await prisma.clientUser.upsert({ where: { email: u.email }, update: { fullName: u.name, passwordHash }, create: { id: u.id, tenantId: u.t, clientId: u.clientId, email: u.email, fullName: u.name, passwordHash } });
  }
}

// ============================================================
// حساب العرض للعميل الأول: Gulf Insurance Brokers Co. (بيانات ديمو محاكية للواقع)
// معرّفات مستقلّة (gib-*) لا تمسّ كيانات الاختبارات. يُبذر في التطوير فقط (لا في ibp_test).
// ============================================================
const GIB_DEF: TenantDef = {
  id: "gib-demo",
  name: "شركة الخليج لوساطة التأمين",
  nameEn: "Gulf Insurance Brokers Co.",
  cr: "1010209134", // مشتق من ترخيص هيئة التأمين IA-20091/34/وسط/ش
  plan: "enterprise",
  billing: "RESELLER",
  seatsUsed: 6,
  seatsLicensed: 100,
  branches: [{ code: "RUH", name: "الرياض — المركز الرئيسي" }, { code: "JED", name: "جدة" }],
  users: [
    { email: "AAlanazi@gib-sa.com", name: "عبدالحميد العنزي", role: "general_manager" }, // مالك الحساب (أوّل مستخدم)
    { email: "pricing@gib-sa.com", name: "خالد المطيري", role: "pricing_officer" },
    { email: "finance@gib-sa.com", name: "منى الدوسري", role: "accountant" },
    { email: "claims@gib-sa.com", name: "سعود الحربي", role: "claims_officer" },
    { email: "compliance@gib-sa.com", name: "ريم الغامدي", role: "compliance_manager" },
    { email: "care@gib-sa.com", name: "نوف السبيعي", role: "customer_care_manager" },
  ],
  clients: [],
  wallets: [{ service: "yaqeen", balance: 120 }, { service: "wathiq", balance: 85 }, { service: "screening", balance: 200 }],
};

async function seedGibDemo(passwordHash: string) {
  const T = GIB_DEF.id;
  await seedTenant(GIB_DEF, passwordHash);

  // ---- العنوان الوطني لشركة الوساطة (يظهر في الفاتورة الضريبية) ----
  await prisma.tenant.update({ where: { id: T }, data: { buildingNo: "3521", street: "طريق الملك فهد", district: "العليا", city: "الرياض", postalCode: "12333" } });

  // ---- عملاء واقعيون ----
  const clients: Array<{ id: string; name: string; id2: string; type: "CORPORATE" | "INDIVIDUAL"; city: string; email: string; phone: string; compliance: "APPROVED" | "PENDING" | "REJECTED" }> = [
    { id: "gib-cl-maaden", name: "شركة معادن الخليج للتعدين", id2: "1010445501", type: "CORPORATE", city: "الرياض", email: "insurance@gulf-maaden.sa", phone: "0114567001", compliance: "APPROVED", collect: "direct" }, // حساب مؤسسي كبير يدفع للمؤمِّن مباشرةً
    { id: "gib-cl-noor", name: "مجموعة النور الطبية", id2: "4030556602", type: "CORPORATE", city: "جدة", email: "admin@alnoor-medical.sa", phone: "0126678002", compliance: "APPROVED" },
    { id: "gib-cl-bina", name: "شركة البناء المتكامل للمقاولات", id2: "1010667703", type: "CORPORATE", city: "الرياض", email: "pm@integrated-const.sa", phone: "0114550003", compliance: "APPROVED" },
    { id: "gib-cl-shael", name: "أسطول الشعّال للنقل البري", id2: "2050778804", type: "CORPORATE", city: "الدمام", email: "fleet@alshaal-transport.sa", phone: "0138990004", compliance: "APPROVED" },
    { id: "gib-cl-yaqut", name: "مصنع الياقوت للأغذية", id2: "1010889905", type: "CORPORATE", city: "الرياض", email: "ops@yaqut-foods.sa", phone: "0112330005", compliance: "PENDING" },
    { id: "gib-cl-durra", name: "شركة درّة البحر للشحن", id2: "3040991106", type: "CORPORATE", city: "جدة", email: "cargo@durrah-shipping.sa", phone: "0126710006", compliance: "APPROVED" },
    { id: "gib-cl-safwa", name: "مجمّع الصفوة التجاري", id2: "1010112207", type: "CORPORATE", city: "الرياض", email: "mall@alsafwa-mall.sa", phone: "0114780007", compliance: "APPROVED" },
    { id: "gib-cl-turki", name: "تركي فهد العتيبي", id2: "1076543201", type: "INDIVIDUAL", city: "الرياض", email: "t.alotaibi@email.sa", phone: "0551200008", compliance: "APPROVED" },
    { id: "gib-cl-hessa", name: "حصة عبدالعزيز الرشيد", id2: "1065432109", type: "INDIVIDUAL", city: "الرياض", email: "h.alrashid@email.sa", phone: "0567800009", compliance: "APPROVED" },
    { id: "gib-cl-manar", name: "شركة المنار للطاقة", id2: "1010334410", type: "CORPORATE", city: "الرياض", email: "hse@almanar-energy.sa", phone: "0114990010", compliance: "REJECTED" },
  ];
  const nameOf: Record<string, string> = {};
  let ci = 6000;
  for (const c of clients) {
    ci++;
    nameOf[c.id] = c.name;
    await prisma.client.upsert({
      where: { id: c.id }, update: { name: c.name, city: c.city, email: c.email, complianceStatus: c.compliance, collectionModel: (c as { collect?: string }).collect ?? "collect_full" },
      create: { id: c.id, tenantId: T, type: c.type, name: c.name, crNumber: c.type === "CORPORATE" ? c.id2 : null, nationalId: c.type === "INDIVIDUAL" ? c.id2 : null, email: c.email, phone: c.phone, city: c.city, code: `CLI-2026-${ci}`, status: "active", complianceStatus: c.compliance, collectionModel: (c as { collect?: string }).collect ?? "collect_full" },
    });
  }

  // ---- وثائق سارية + إشعار مدين + فاتورة + عمولة لكل وثيقة سارية (عبر فروع وحالات متنوّعة) ----
  const policies: Array<{ id: string; clientId: string; line: string; ins: number; net: number; comm: number; start: string; end: string; status: string }> = [
    { id: "gib-p-maaden-pro", clientId: "gib-cl-maaden", line: "PAR", ins: 0, net: 480000, comm: 15, start: "2026-01-05", end: "2027-01-04", status: "ISSUED" },
    { id: "gib-p-maaden-eng", clientId: "gib-cl-maaden", line: "CAR", ins: 5, net: 620000, comm: 16, start: "2026-02-10", end: "2027-08-09", status: "ISSUED" },
    { id: "gib-p-noor-med", clientId: "gib-cl-noor", line: "GMI", ins: 1, net: 890000, comm: 12, start: "2026-01-01", end: "2026-12-31", status: "ISSUED" },
    { id: "gib-p-noor-pli", clientId: "gib-cl-noor", line: "PLI", ins: 11, net: 120000, comm: 15, start: "2026-03-01", end: "2027-02-28", status: "ISSUED" },
    { id: "gib-p-bina-eng", clientId: "gib-cl-bina", line: "EAR", ins: 5, net: 540000, comm: 16, start: "2026-02-20", end: "2027-08-19", status: "ISSUED" },
    { id: "gib-p-bina-gpa", clientId: "gib-cl-bina", line: "GPA", ins: 9, net: 68000, comm: 10, start: "2026-04-01", end: "2027-03-31", status: "ISSUED" },
    { id: "gib-p-shael-mot", clientId: "gib-cl-shael", line: "MCI", ins: 3, net: 340000, comm: 10, start: "2026-03-15", end: "2027-03-14", status: "ISSUED" },
    { id: "gib-p-durra-mar", clientId: "gib-cl-durra", line: "MCG", ins: 7, net: 260000, comm: 13, start: "2026-04-10", end: "2027-04-09", status: "ISSUED" },
    { id: "gib-p-safwa-fire", clientId: "gib-cl-safwa", line: "FIR", ins: 2, net: 195000, comm: 12.5, start: "2026-05-01", end: "2027-04-30", status: "ISSUED" },
    { id: "gib-p-noor-life", clientId: "gib-cl-noor", line: "GLI", ins: 10, net: 210000, comm: 9, start: "2026-05-15", end: "2027-05-14", status: "ISSUED" }, // حياة — معفى ض.ق.م
    { id: "gib-p-turki-mot", clientId: "gib-cl-turki", line: "MCI", ins: 0, net: 11500, comm: 10, start: "2026-06-01", end: "2027-05-31", status: "ISSUED" },
    { id: "gib-p-hessa-trv", clientId: "gib-cl-hessa", line: "TRV", ins: 13, net: 2200, comm: 20, start: "2026-06-20", end: "2026-12-20", status: "ISSUED" },
    { id: "gib-p-yaqut-pro", clientId: "gib-cl-yaqut", line: "PAR", ins: 0, net: 175000, comm: 13, start: "2026-06-25", end: "2027-06-24", status: "TECHNICAL_REVIEW" },
    { id: "gib-p-safwa-mot", clientId: "gib-cl-safwa", line: "MTP", ins: 11, net: 145000, comm: 10, start: "2026-06-22", end: "2027-06-21", status: "FINANCE_REVIEW" },
  ];
  const vat15 = (cr: string) => `3${cr.replace(/\D/g, "").padEnd(13, "0").slice(0, 13)}3`.slice(0, 15);
  let sp = 6100;
  for (const p of policies) {
    sp++;
    // E1 — تأمين الحياة معفى
    const exempt = p.line === "GLI" || p.line === "TRM";
    const vat = exempt ? 0 : round2(p.net * 0.15), total = round2(p.net + vat), comm = round2((p.net * p.comm) / 100);
    const fees = p.status === "ISSUED" && !exempt && sp % 3 === 0 ? 350 : 0; // رسوم خدمة على كل ثالث وثيقة (لا على المعفى)
    const feesVat = round2(fees * 0.15);
    await prisma.policy.upsert({
      where: { id: p.id }, update: { status: p.status as never, sumInsured: siOf(p.line, p.net), policyFees: fees },
      create: { id: p.id, tenantId: T, clientId: p.clientId, productLineCode: p.line, insurerName: INSURERS[p.ins], sequenceNo: `POL-RUH-${p.line}-2026-${sp}`, premium: p.net, vat, totalPremium: total, sumInsured: siOf(p.line, p.net), policyFees: fees, commissionRate: p.comm, commissionAmount: comm, status: p.status as never, startDate: D(p.start), endDate: D(p.end) },
    });
    if (p.status !== "ISSUED") continue;
    await prisma.debitNote.upsert({ where: { id: `gib-dn-${p.id}` }, update: { netAmount: round2(p.net + fees), vatAmount: round2(vat + feesVat) }, create: { id: `gib-dn-${p.id}`, tenantId: T, clientId: p.clientId, policyId: p.id, sequenceNo: `DN-2026-${sp}`, netAmount: round2(p.net + fees), vatAmount: round2(vat + feesVat) } });
    const commVat = round2(comm * 0.15);
    await prisma.invoice.upsert({ where: { id: `gib-inv-${p.id}` }, update: { kind: "COMMISSION" }, create: { id: `gib-inv-${p.id}`, tenantId: T, kind: "COMMISSION", policyId: p.id, insurerName: INSURERS[p.ins], sequenceNo: `INV-2026-${sp}`, netAmount: comm, vatAmount: commVat, totalAmount: round2(comm + commVat), status: "issued", zatcaUuid: `zatca-${p.id}`, zatcaHash: "demo-hash", qrPayload: "demo-qr" } });
    if (fees > 0) await prisma.invoice.upsert({ where: { id: `gib-inv-fees-${p.id}` }, update: { netAmount: fees, vatAmount: feesVat, totalAmount: round2(fees + feesVat) }, create: { id: `gib-inv-fees-${p.id}`, tenantId: T, kind: "FEES", policyId: p.id, clientId: p.clientId, sequenceNo: `INV-2026-${sp}-F`, netAmount: fees, vatAmount: feesVat, totalAmount: round2(fees + feesVat), status: "issued", zatcaUuid: `zatca-fees-${p.id}`, zatcaHash: "demo-hash", qrPayload: "demo-qr" } });
    const st = ["received", "accrued", "variance"][sp % 3];
    const recv = st === "received" ? comm : st === "variance" ? round2(comm * 0.9) : null;
    await prisma.commission.upsert({ where: { id: `gib-com-${p.id}` }, update: {}, create: { id: `gib-com-${p.id}`, tenantId: T, policyId: p.id, insurerName: INSURERS[p.ins], clientName: nameOf[p.clientId] ?? "—", productLine: p.line, rate: p.comm, amount: comm, receivedAmount: recv, status: st, periodMonth: p.start.slice(0, 7) } });
  }

  // ---- طلبات في مراحل مختلفة + عروض أسعار ----
  const reqs: Array<{ id: string; clientId: string; line: string; status: string; seq: string; quote?: number[] }> = [
    { id: "gib-r-maaden-mot", clientId: "gib-cl-maaden", line: "MCI", status: "QUOTING", seq: "SL-RUH-MCI-2026-7001", quote: [0, 3, 11] },
    { id: "gib-r-safwa-eng", clientId: "gib-cl-safwa", line: "CAR", status: "QUOTING", seq: "SL-RUH-CAR-2026-7002", quote: [5, 2, 13] },
    { id: "gib-r-durra-mar", clientId: "gib-cl-durra", line: "MCG", status: "AWARDED", seq: "SL-JED-MCG-2026-7003" },
    { id: "gib-r-noor-med", clientId: "gib-cl-noor", line: "GMI", status: "UNDER_REVIEW", seq: "SL-RUH-GMI-2026-7004" },
    { id: "gib-r-bina-pro", clientId: "gib-cl-bina", line: "PAR", status: "DRAFT", seq: "SL-RUH-PAR-2026-7005" },
    { id: "gib-r-manar-eng", clientId: "gib-cl-manar", line: "EAR", status: "REJECTED", seq: "SL-RUH-EAR-2026-7006" },
  ];
  let sq = 7100;
  for (const r of reqs) {
    await prisma.policyRequest.upsert({ where: { id: r.id }, update: { status: r.status as never }, create: { id: r.id, tenantId: T, clientId: r.clientId, productLineCode: r.line, status: r.status as never, sequenceNo: r.seq, base: {} } });
    if (!r.quote) continue;
    const slipId = `gib-slip-${r.id}`;
    await prisma.slip.upsert({ where: { id: slipId }, update: {}, create: { id: slipId, tenantId: T, requestId: r.id, sequenceNo: `RFQ-${r.line}-2026-${sq}`, insurers: r.quote.map((i) => INSURERS[i]), notes: "طلب عروض أسعار — مقارنة فنية وسعرية" } });
    let qi = 0;
    for (const ins of r.quote) {
      qi++; sq++;
      const net = 45000 + ins * 8000 + qi * 6000, vat = round2(net * 0.15);
      await prisma.quotation.upsert({ where: { id: `gib-q-${r.id}-${qi}` }, update: {}, create: { id: `gib-q-${r.id}-${qi}`, tenantId: T, slipId, insurerName: INSURERS[ins], rate: 2 + qi * 0.5, premium: net, vat, totalPremium: round2(net + vat), deductible: 1000 * qi, limit: 1000000 * qi, validUntil: D("2026-09-30"), generalRemarks: "شامل التغطيات الأساسية", additionalConditions: qi === 2 ? "خصم عدم مطالبات 10%" : null } });
    }
  }

  // ---- طلبات خدمة (بأولوية وإسناد لمدير خدمة العملاء) ----
  const care = await prisma.user.findFirst({ where: { tenantId: T, email: "care@gib-sa.com" }, select: { id: true } });
  const svcs = [
    { id: "gib-s-noor-add", clientId: "gib-cl-noor", policyId: "gib-p-noor-med", type: "addition", subject: "إضافة 20 موظفاً للوثيقة الطبية", status: "IN_PROGRESS", seq: "RQ-2026-8001", priority: "high", assign: true },
    { id: "gib-s-maaden-amd", clientId: "gib-cl-maaden", policyId: "gib-p-maaden-pro", type: "amendment", subject: "رفع مبلغ التأمين على الأصول", status: "SENT_TO_INSURER", seq: "RQ-2026-8002", priority: "urgent", assign: true },
    { id: "gib-s-bina-del", clientId: "gib-cl-bina", policyId: "gib-p-bina-eng", type: "deletion", subject: "حذف معدّة من وثيقة التركيب", status: "CLOSED", seq: "RQ-2026-8003", priority: "normal", assign: false },
    { id: "gib-s-safwa-inq", clientId: "gib-cl-safwa", policyId: "gib-p-safwa-fire", type: "inquiry", subject: "استفسار عن تغطية انقطاع الأعمال", status: "OPEN", seq: "RQ-2026-8004", priority: "normal", assign: false },
    { id: "gib-s-durra-ren", clientId: "gib-cl-durra", policyId: "gib-p-durra-mar", type: "renewal", subject: "طلب تجديد وثيقة الشحن البحري", status: "OPEN", seq: "RQ-2026-8005", priority: "high", assign: true },
  ];
  for (const s of svcs) {
    const assigneeId = s.assign ? care?.id ?? null : null;
    await prisma.serviceRequest.upsert({ where: { id: s.id }, update: { priority: s.priority, assigneeId }, create: { id: s.id, tenantId: T, clientId: s.clientId, policyId: s.policyId, type: s.type, subject: s.subject, status: s.status as never, sequenceNo: s.seq, priority: s.priority, assigneeId } });
  }

  // ---- مطالبات متنوّعة الحالات ----
  const claims = [
    { id: "gib-c-noor-med", clientId: "gib-cl-noor", policyId: "gib-p-noor-med", ins: 1, incident: "2026-03-18", claimed: 42000, deduct: 3000, settled: 35000, status: "SETTLED", seq: "CL-RUH-2026-9001" },
    { id: "gib-c-maaden-eng", clientId: "gib-cl-maaden", policyId: "gib-p-maaden-eng", ins: 5, incident: "2026-04-25", claimed: 310000, deduct: 30000, settled: null, status: "UNDER_REVIEW", seq: "CL-RUH-2026-9002" },
    { id: "gib-c-safwa-fire", clientId: "gib-cl-safwa", policyId: "gib-p-safwa-fire", ins: 2, incident: "2026-05-14", claimed: 88000, deduct: 8000, settled: null, status: "SUBMITTED", seq: "CL-RUH-2026-9003" },
    { id: "gib-c-shael-mot", clientId: "gib-cl-shael", policyId: "gib-p-shael-mot", ins: 3, incident: "2026-05-30", claimed: 26000, deduct: 2000, settled: null, status: "RECEIVED", seq: "CL-RUH-2026-9004" },
    { id: "gib-c-turki-mot", clientId: "gib-cl-turki", policyId: "gib-p-turki-mot", ins: 0, incident: "2026-06-05", claimed: 8600, deduct: 500, settled: 8100, status: "SETTLED", seq: "CL-RUH-2026-9005" },
  ];
  for (const c of claims) {
    await prisma.claim.upsert({ where: { id: c.id }, update: {}, create: { id: c.id, tenantId: T, clientId: c.clientId, policyId: c.policyId, insurerName: INSURERS[c.ins], claimedAmount: c.claimed, deductible: c.deduct, settledAmount: c.settled ?? null, status: c.status as never, incidentDate: D(c.incident), sequenceNo: c.seq } });
  }

  // ---- عمليات تحقّق KYC/KYB + PEP ----
  const provs = Object.fromEntries((await prisma.verificationProvider.findMany({ select: { id: true, key: true } })).map((p) => [p.key, p.id]));
  const vchecks = [
    { id: "gib-k-maaden-cr", clientId: "gib-cl-maaden", key: "wathiq", checkType: "cr", risk: null },
    { id: "gib-k-noor-cr", clientId: "gib-cl-noor", key: "wathiq", checkType: "cr", risk: null },
    { id: "gib-k-noor-pep", clientId: "gib-cl-noor", key: "screening", checkType: "pep_sanctions", risk: "low" },
    { id: "gib-k-manar-pep", clientId: "gib-cl-manar", key: "screening", checkType: "pep_sanctions", risk: "high" },
    { id: "gib-k-durra-pep", clientId: "gib-cl-durra", key: "screening", checkType: "pep_sanctions", risk: "medium" },
    { id: "gib-k-turki-id", clientId: "gib-cl-turki", key: "yaqeen", checkType: "identity", risk: null },
    { id: "gib-k-hessa-id", clientId: "gib-cl-hessa", key: "yaqeen", checkType: "identity", risk: null },
    { id: "gib-k-bina-addr", clientId: "gib-cl-bina", key: "spl", checkType: "address", risk: null },
  ];
  for (const c of vchecks) {
    if (!provs[c.key]) continue;
    await prisma.verificationCheck.upsert({ where: { id: c.id }, update: {}, create: { id: c.id, tenantId: T, providerId: provs[c.key], checkType: c.checkType, status: "success", clientId: c.clientId, riskLevel: c.risk, cost: c.key === "spl" ? 0 : 3 } });
  }

  // ---- مستندات ----
  const docs = [
    { id: "gib-d-noor-sched", entityType: "policy", entityId: "gib-p-noor-med", fileName: "جدول الوثيقة الطبية — النور.pdf", docType: "OFFICIAL" },
    { id: "gib-d-maaden-cert", entityType: "policy", entityId: "gib-p-maaden-pro", fileName: "شهادة تأمين ممتلكات معادن.pdf", docType: "OFFICIAL" },
    { id: "gib-d-durra-mar", entityType: "policy", entityId: "gib-p-durra-mar", fileName: "بوليصة الشحن البحري — درّة.pdf", docType: "OFFICIAL" },
    { id: "gib-d-safwa-claim", entityType: "claim", entityId: "gib-c-safwa-fire", fileName: "تقرير معاينة حريق الصفوة.pdf", docType: "ATTACHMENT" },
    { id: "gib-d-maaden-cr", entityType: "client", entityId: "gib-cl-maaden", fileName: "السجل التجاري — معادن الخليج.pdf", docType: "ATTACHMENT" },
  ];
  for (const d of docs) {
    await prisma.document.upsert({ where: { id: d.id }, update: {}, create: { id: d.id, tenantId: T, storageKey: `${T}/seed/${d.id}.pdf`, fileName: d.fileName, mime: "application/pdf", sizeBytes: 142000, hash: "seed", docType: d.docType as never, entityType: d.entityType, entityId: d.entityId } });
  }

  // ---- مستخدمو بوّابة العميل ----
  const portalUsers = [
    { id: "gib-cu-noor", clientId: "gib-cl-noor", email: "portal@alnoor-medical.sa", name: "إدارة مجموعة النور الطبية" },
    { id: "gib-cu-maaden", clientId: "gib-cl-maaden", email: "portal@gulf-maaden.sa", name: "إدارة معادن الخليج" },
    { id: "gib-cu-safwa", clientId: "gib-cl-safwa", email: "portal@alsafwa-mall.sa", name: "إدارة مجمّع الصفوة" },
  ];
  for (const u of portalUsers) {
    await prisma.clientUser.upsert({ where: { email: u.email }, update: { fullName: u.name, passwordHash }, create: { id: u.id, tenantId: T, clientId: u.clientId, email: u.email, fullName: u.name, passwordHash } });
  }

  // ---- تهيئة ZATCA (Sandbox، مُفعّلة) + قيد تدقيق البذر ----
  await prisma.tenantZatcaConfig.upsert({
    where: { tenantId: T }, update: { vatNumber: vat15(GIB_DEF.cr), businessNameAr: GIB_DEF.name, businessNameEn: GIB_DEF.nameEn },
    create: { tenantId: T, vatNumber: vat15(GIB_DEF.cr), businessNameAr: GIB_DEF.name, businessNameEn: GIB_DEF.nameEn, environment: "SANDBOX", egsSerialNumber: `EGS-${T}-001`, onboardingStatus: "ACTIVE", lastActivatedAt: new Date() },
  });
  await prisma.auditLog.create({ data: { tenantId: T, action: "seed", entity: "system", meta: { note: "GIB demo (mock data only)" } } });
}

// بيانات CRM ديمو (صفقات/مهام/نشاط) — تطوير فقط. clientIds من نفس المستأجر.
async function seedCrm(tenantId: string, ownerEmail: string, clientIds: string[], prefix: string) {
  const owner = await prisma.user.findFirst({ where: { tenantId, email: ownerEmail }, select: { id: true } });
  const deals = [
    { t: "تأمين طبي جماعي — 120 موظفًا", stage: "quoting", value: 320000, line: "GMI", c: 0 },
    { t: "تأمين أسطول مركبات", stage: "negotiation", value: 180000, line: "MCI", c: 1 },
    { t: "تأمين ممتلكات مستودع", stage: "new", value: 95000, line: "PAR", c: 2 },
    { t: "تأمين مسؤولية مهنية", stage: "contacted", value: 60000, line: "PLI", c: 3 },
    { t: "تأمين حياة جماعي", stage: "proposal", value: 140000, line: "GLI", c: 0 },
  ];
  let i = 0;
  for (const d of deals) {
    i++;
    const id = `${prefix}-deal-${i}`;
    await prisma.deal.upsert({ where: { id }, update: { stage: d.stage, status: "open" }, create: { id, tenantId, title: d.t, stage: d.stage, value: d.value, productLineCode: d.line, clientId: clientIds[d.c] ?? null, assigneeId: i <= 2 ? owner?.id ?? null : null, createdById: owner?.id ?? null } });
    await prisma.crmActivity.upsert({ where: { id: `${id}-a` }, update: {}, create: { id: `${id}-a`, tenantId, entityType: "deal", entityId: id, type: "note", body: "بدأ التواصل مع العميل بخصوص العرض", authorId: owner?.id ?? null } });
  }
  const tasks = [
    { t: "متابعة عرض التأمين الطبي مع العميل", prio: "high", due: "2026-07-10" },
    { t: "إرسال المقارنة السعرية للعميل", prio: "normal", due: "2026-07-08" },
    { t: "تجديد وثيقة الممتلكات المستحقّة", prio: "high", due: "2026-07-15" },
  ];
  let j = 0;
  for (const tk of tasks) {
    j++;
    await prisma.crmTask.upsert({ where: { id: `${prefix}-task-${j}` }, update: {}, create: { id: `${prefix}-task-${j}`, tenantId, title: tk.t, priority: tk.prio, dueDate: D(tk.due), assigneeId: owner?.id ?? null, createdById: owner?.id ?? null } });
  }
}

/**
 * بذرة إقلاع الإنتاج — مرجعيات فقط (باقات + كتالوج + مزوّدون) + سوبر أدمن من البيئة.
 * لا مستأجرين وهميين ولا بيانات تجريبية. حساب GIB الحقيقي يُنشأ لاحقًا عبر التسجيل/التزويد.
 * كلمة مرور السوبر أدمن إلزامية من البيئة (لا افتراضي في الإنتاج)، ولا تُعاد كتابتها عند إعادة التشغيل.
 */
/** عمولات الموظفين (ديمو): نِسب لبعض مندوبي المبيعات + إسنادهم لوثائق الخليج المُصدَرة مع احتساب حصّتهم. */
async function seedEmployeeCommissions() {
  const reps = [
    { email: "waleed@gulf-demo.sa", rate: 10 },
    { email: "sara@gulf-demo.sa", rate: 8 },
  ];
  const resolved: Array<{ id: string; rate: number }> = [];
  for (const r of reps) {
    const u = await prisma.user.findFirst({ where: { email: r.email }, select: { id: true } });
    if (u) { await prisma.user.update({ where: { id: u.id }, data: { commissionRate: r.rate } }); resolved.push({ id: u.id, rate: r.rate }); }
  }
  if (!resolved.length) return;
  const pols = await prisma.policy.findMany({ where: { tenantId: "demo-tenant", status: "ISSUED" }, select: { id: true, commissionAmount: true } });
  let i = 0;
  for (const p of pols) {
    const rep = resolved[i % resolved.length];
    const sc = +((Number(p.commissionAmount ?? 0) * rep.rate) / 100).toFixed(2);
    await prisma.policy.update({ where: { id: p.id }, data: { salespersonId: rep.id, salespersonCommission: sc } });
    i++;
  }
}

async function seedProductionBootstrap() {
  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim();
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("SEED_MODE=production يتطلّب PLATFORM_ADMIN_EMAIL و PLATFORM_ADMIN_PASSWORD في البيئة — لا سوبر أدمن بكلمة مرور افتراضية في الإنتاج.");
  }
  if (password.length < 12) throw new Error("PLATFORM_ADMIN_PASSWORD يجب ألا يقلّ عن 12 حرفًا.");
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.platformAdmin.upsert({
    where: { email },
    update: {}, // موجود مسبقًا ⇒ لا نُعيد ضبط كلمة مروره (بذرة idempotent آمنة)
    create: { email, fullName: process.env.PLATFORM_ADMIN_NAME?.trim() || "مالك المنصة", passwordHash },
  });
  console.log("✅ بذرة إقلاع الإنتاج: الباقات + الكتالوج + المزوّدون + سوبر أدمن (من البيئة). لا بيانات تجريبية/مستأجرين وهميين.");
  console.log(`   سوبر أدمن المنصة: ${email}`);
}

async function main() {
  // المرجعيات تُبذَر في كل الأوضاع (إنتاج/ديمو/اختبار) — آمنة idempotent.
  await seedPlans();
  await seedCatalog();
  await seedProviders();

  // وضع الإقلاع الإنتاجي: مرجعيات + سوبر أدمن فقط، ثم توقّف (لا مستأجرين وهميين).
  const seedMode = process.env.SEED_MODE;
  if (seedMode === "production") {
    await seedProductionBootstrap();
    return;
  }

  // حاجز أمان: منع حقن بيانات تجريبية في بيئة منشورة (NODE_ENV=production) دون قصد صريح.
  if (process.env.NODE_ENV === "production" && seedMode !== "demo") {
    throw new Error(
      "رُفض تشغيل بذرة الديمو على NODE_ENV=production. استخدم `SEED_MODE=production` (بذرة إقلاع مرجعية للإنتاج الحقيقي)، " +
        "أو `SEED_MODE=demo` صراحةً لبيئة ديمو/تجريبية منشورة.",
    );
  }

  console.log("🌱 IBP seed — بيانات وهمية فقط (وضع الديمو)");
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);

  // قاعدة الاختبار فقط: امسح طلبات التجديد التي تُنشئها اختبارات e2e (لا تُبذَر أصلاً) —
  // البذرة idempotent بالـupsert ولا تُفرّغ الجداول، فتتراكم التجديدات وتُشبِع مجمّع الوثائق المستحقّة.
  // مسحها هنا يضمن أن كل دورة اختبار تبدأ من مجمّع تجديد نظيف (حتمية عبر إعادات التشغيل).
  if ((process.env.DATABASE_URL ?? "").includes("ibp_test")) {
    await prisma.policyRequest.deleteMany({ where: { renewedFromPolicyId: { not: null } } });
  }

  for (const def of TENANTS) {
    await seedTenant(def, passwordHash);
    await prisma.auditLog.create({
      data: { tenantId: def.id, action: "seed", entity: "system", meta: { note: "dev seed (mock data only)" } },
    });
  }

  await seedOperations(passwordHash);
  await seedRichData(passwordHash);
  await seedEmployeeCommissions();

  // حساب العرض للعميل الأول (Gulf Insurance Brokers Co.) — في التطوير فقط (لا يُلوّث قاعدة الاختبار)
  const isTestDb = (process.env.DATABASE_URL ?? "").includes("ibp_test");
  if (!isTestDb) {
    await seedGibDemo(passwordHash);
    await seedCrm("demo-tenant", "waleed@gulf-demo.sa", ["cl-naseej", "cl-redsea", "cl-salamah", "cl-emaar"], "rd");
    await seedCrm("gib-demo", "AAlanazi@gib-sa.com", ["gib-cl-noor", "gib-cl-maaden", "gib-cl-safwa", "gib-cl-bina"], "gib");
  }

  // تهيئة ZATCA لكل مستأجر (Sandbox، مُفعّلة للعرض) — رقم ضريبي صالح 15 رقماً
  const vat15 = (cr: string) => `3${cr.replace(/\D/g, "").padEnd(13, "0").slice(0, 13)}3`.slice(0, 15);
  for (const def of TENANTS) {
    await prisma.tenantZatcaConfig.upsert({
      where: { tenantId: def.id },
      update: { vatNumber: vat15(def.cr), businessNameAr: def.name, businessNameEn: def.nameEn },
      create: {
        tenantId: def.id, vatNumber: vat15(def.cr), businessNameAr: def.name, businessNameEn: def.nameEn,
        environment: "SANDBOX", egsSerialNumber: `EGS-${def.id}-001`, onboardingStatus: "ACTIVE", lastActivatedAt: new Date(),
      },
    });
  }

  // مالك المنصة (سوبر أدمن) — كلمة المرور/البريد من البيئة إن وُجدت (لـstaging المنشورة)، وإلا الافتراضي التطويري.
  const adminEmail = (process.env.PLATFORM_ADMIN_EMAIL ?? "admin@ibp-platform.sa").trim();
  const adminHash = process.env.PLATFORM_ADMIN_PASSWORD ? await bcrypt.hash(process.env.PLATFORM_ADMIN_PASSWORD, 10) : passwordHash;
  await prisma.platformAdmin.upsert({
    where: { email: adminEmail },
    update: { passwordHash: adminHash },
    create: { email: adminEmail, fullName: process.env.PLATFORM_ADMIN_NAME?.trim() || "مالك المنصة", passwordHash: adminHash },
  });

  // قيود يومية (JRV) لكل وثيقة مُصدَرة — كي يكتمل ميزان المراجعة ويتّسق مع الملخّص المالي.
  const issuedPolicies = await prisma.policy.findMany({ where: { status: "ISSUED" }, select: { id: true, tenantId: true, sequenceNo: true, premium: true, vat: true, totalPremium: true, commissionAmount: true, policyFees: true }, orderBy: { id: "asc" } });
  let jrvi = 0;
  for (const p of issuedPolicies) {
    jrvi++;
    const total = round2(Number(p.totalPremium ?? 0));
    const commission = round2(Number(p.commissionAmount ?? 0));
    const commVat = round2(commission * 0.15);
    const trust = round2(total - commission - commVat);
    const fees = round2(Number(p.policyFees ?? 0)); // رسوم الخدمة (إيراد الوسيط، خارج الأمانة)
    const feesVat = round2(fees * 0.15);
    const grand = round2(total + fees + feesVat);
    const entries = [
      { account: "01030000000000000", name: "ذمم العملاء المدينة", debit: grand, credit: 0 },
      { account: "02020000000000000", name: "أمانات أقساط العملاء (Off-Balance)", debit: 0, credit: trust },
      { account: "04010000000000000", name: "عمولات الوساطة", debit: 0, credit: commission },
      { account: "02030000000000000", name: "ضريبة القيمة المضافة المستحقة (Output VAT)", debit: 0, credit: round2(commVat + feesVat) },
    ];
    if (fees > 0) entries.push({ account: "04020000000000000", name: "رسوم خدمات وإصدار الوثائق", debit: 0, credit: fees });
    await prisma.voucher.upsert({
      where: { id: `jrv-seed-${p.id}` },
      update: { amount: grand, lines: { description: `إصدار الوثيقة ${p.sequenceNo}`, entries } },
      create: { id: `jrv-seed-${p.id}`, tenantId: p.tenantId, type: "JRV", sequenceNo: `JRV-2026-${20001 + jrvi}`, amount: grand, status: "posted", isAuto: true, reference: p.id, lines: { description: `إصدار الوثيقة ${p.sequenceNo}`, entries } },
    });
  }

  // تحصيل واقعي: تسوية جزء من إشعارات المدين بسندات قبض (RCV) — كي تتحرّك الذمم في الديمو
  // (مسدَّد بالكامل ~40% · جزئي ~20% · مستحقّ ~40%)، بشكل حتمي حسب الترتيب.
  const allNotes = await prisma.debitNote.findMany({ select: { id: true, tenantId: true, sequenceNo: true, netAmount: true, vatAmount: true, createdAt: true }, orderBy: { id: "asc" } });
  for (let i = 0; i < allNotes.length; i++) {
    const dn = allNotes[i];
    const gross = round2(Number(dn.netAmount ?? 0) + Number(dn.vatAmount ?? 0));
    const mode = i % 5; // 0,1 مسدَّد · 2 جزئي · 3,4 مستحقّ
    const settled = mode === 0 || mode === 1 ? gross : mode === 2 ? round2(gross * 0.5) : 0;
    if (settled <= 0) continue;
    await prisma.debitNote.update({ where: { id: dn.id }, data: { settledAmount: settled, settledAt: settled >= gross ? dn.createdAt : null } });
    await prisma.voucher.upsert({
      where: { id: `rcv-seed-${dn.id}` },
      update: { amount: settled },
      create: { id: `rcv-seed-${dn.id}`, tenantId: dn.tenantId, type: "RCV", sequenceNo: `RCV-2026-${10001 + i}`, amount: settled, status: "posted", isAuto: false, reference: dn.id, lines: { description: `تحصيل مقابل ${dn.sequenceNo ?? dn.id}`, method: "transfer", clientId: null } },
    });
  }

  // خطة تقسيط توضيحية (إشعار مدين لعميل الفهد) — تُظهر أقساطًا مسدَّدة/جزئية/متأخّرة/قادمة (ديمو + اختبار البوّابة)
  {
    const planNoteId = "dn-pol-fahd-mot"; // DN-2026-1002 (الفهد — المركبات)
    const pn = await prisma.debitNote.findUnique({ where: { id: planNoteId }, select: { id: true, tenantId: true, clientId: true, policyId: true, netAmount: true, vatAmount: true } });
    if (pn) {
      const gross = round2(Number(pn.netAmount ?? 0) + Number(pn.vatAmount ?? 0));
      const collected = round2(gross * 0.45); // 45% محصّلة ⇒ خليط حالات عبر الترحيل بالأقدم استحقاقًا
      // ثبّت الإشعار على «جزئي» حتميًا مع سند القبض المطابق كي تكون الخطة توضيحية
      await prisma.debitNote.update({ where: { id: pn.id }, data: { settledAmount: collected, settledAt: null } });
      await prisma.voucher.upsert({
        where: { id: `rcv-seed-${pn.id}` },
        update: { amount: collected },
        create: { id: `rcv-seed-${pn.id}`, tenantId: pn.tenantId, type: "RCV", sequenceNo: "RCV-2026-19002", amount: collected, status: "posted", isAuto: false, reference: pn.id, lines: { description: "تحصيل جزئي (خطة تقسيط)", method: "transfer", clientId: pn.clientId } },
      });
      const count = 4;
      const per = round2(gross / count);
      const base = new Date("2026-05-01T00:00:00.000Z"); // 4 دفعات شهرية: 05-01..08-01 (خليط متأخّر/قادم مرجعيًا لتاريخ الديمو)
      let allocated = 0;
      let paidRem = collected;
      for (let s = 0; s < count; s++) {
        const amount = s === count - 1 ? round2(gross - allocated) : per;
        allocated = round2(allocated + amount);
        const due = new Date(base);
        due.setMonth(due.getMonth() + s);
        const applied = round2(Math.min(paidRem, amount));
        paidRem = round2(paidRem - applied);
        const fullyPaid = applied >= amount - 0.001;
        await prisma.installment.upsert({
          where: { id: `inst-seed-${planNoteId}-${s + 1}` },
          update: { amount, settledAmount: applied, settledAt: fullyPaid ? due : null },
          create: { id: `inst-seed-${planNoteId}-${s + 1}`, tenantId: pn.tenantId, debitNoteId: pn.id, clientId: pn.clientId, policyId: pn.policyId, seq: s + 1, dueDate: due, amount, settledAmount: applied, settledAt: fullyPaid ? due : null },
        });
      }
    }
  }

  // ---- سجلّ المنتِجين (الوسطاء الفرعيون) + ربط جزء من الوثائق بهم مع حصّة عمولتهم ----
  const producerDefs = [
    // منتِجو حساب الخليج (ديمو دون قاعدة الاختبار)
    ...(isTestDb ? [] : [
      { id: "prd-gib-1", t: GIB_DEF.id, code: "PRD-1001", name: "مكتب الرواد لوساطة التأمين", type: "COMPANY", licenseNo: "IA-PRD-2024-118", crNumber: "1010556677", commissionRate: 25, iban: "SA0380000000608010167519" },
      { id: "prd-gib-2", t: GIB_DEF.id, code: "PRD-1002", name: "خالد الدوسري (منتِج مرخّص)", type: "INDIVIDUAL", licenseNo: "IA-PRD-2023-441", nationalId: "1055667788", commissionRate: 20, phone: "0555102030" },
    ]),
    { id: "prd-dt-1", t: "demo-tenant", code: "PRD-1003", name: "شركة آفاق التسويق التأميني", type: "COMPANY", licenseNo: "IA-PRD-2024-207", crNumber: "1010889900", commissionRate: 30 },
  ] as Array<{ id: string; t: string; code: string; name: string; type: string; licenseNo: string; crNumber?: string; nationalId?: string; phone?: string; iban?: string; commissionRate: number }>;
  for (const pr of producerDefs) {
    await prisma.producer.upsert({ where: { id: pr.id }, update: { commissionRate: pr.commissionRate, status: "active" }, create: { id: pr.id, tenantId: pr.t, code: pr.code, name: pr.name, type: pr.type, licenseNo: pr.licenseNo, crNumber: pr.crNumber ?? null, nationalId: pr.nationalId ?? null, phone: pr.phone ?? null, iban: pr.iban ?? null, commissionRate: pr.commissionRate, status: "active" } });
  }
  // اربط كل ثالث وثيقة مُصدَرة بمنتِج مناسب لمستأجرها، واحسب حصّته من العمولة بنسبته.
  const linkable = await prisma.policy.findMany({ where: { status: "ISSUED" }, select: { id: true, tenantId: true, commissionAmount: true }, orderBy: { id: "asc" } });
  const producersByTenant = new Map<string, Array<{ id: string; rate: number }>>();
  for (const pr of producerDefs) { const arr = producersByTenant.get(pr.t) ?? []; arr.push({ id: pr.id, rate: pr.commissionRate }); producersByTenant.set(pr.t, arr); }
  let li = 0;
  for (const pol of linkable) {
    const arr = producersByTenant.get(pol.tenantId);
    if (!arr?.length || li % 3 !== 0) { li++; continue; }
    const pr = arr[li % arr.length];
    const share = round2((round2(Number(pol.commissionAmount ?? 0)) * pr.rate) / 100);
    await prisma.policy.update({ where: { id: pol.id }, data: { producerId: pr.id, producerCommission: share } });
    li++;
  }

  // ---- مكتبة قوالب النماذج: قوالب تعبئة مسبقة تُسرّع الطلبات المتكرّرة ----
  const tenantsForTpl = isTestDb ? ["demo-tenant"] : ["demo-tenant", GIB_DEF.id];
  const templateDefs = [
    { line: "SME", name: "طبي المنشآت — شبكة قياسية", desc: "حدّ سنوي 500 ألف · شبكة قياسية", base: { network: "standard", annualLimit: 500000, currency: "SAR" }, blocks: null as unknown },
    { line: "MFL", name: "أسطول مركبات — شامل", desc: "تغطية شاملة لأسطول الشركة", base: { currency: "SAR", coverType: "comprehensive" }, blocks: null as unknown },
    { line: "PAR", name: "ممتلكات — جميع الأخطار", desc: "قالب جميع أخطار الممتلكات", base: { currency: "SAR" }, blocks: null as unknown },
  ];
  for (const T2 of tenantsForTpl) {
    for (let ti = 0; ti < templateDefs.length; ti++) {
      const td = templateDefs[ti];
      await prisma.formTemplate.upsert({
        where: { id: `tpl-${T2}-${td.line}` }, update: { name: td.name, base: td.base },
        create: { id: `tpl-${T2}-${td.line}`, tenantId: T2, name: td.name, productLineCode: td.line, description: td.desc, base: td.base, blocks: td.blocks === null ? Prisma.JsonNull : (td.blocks as Prisma.InputJsonValue), usageCount: (ti + 1) * 2, isActive: true },
      });
    }
  }

  // ---- بيانات ديمو للميزات الجديدة (طلبات تواصل + أهداف أداء + هوية بصرية) — ديمو فقط ----
  if (!isTestDb) {
    // طلبات تواصل مبيعات (Leads) — تظهر في لوحة السوبر أدمن /admin/leads
    const demoLeads = [
      { id: "lead-demo-1", name: "شركة نجم القابضة", email: "procurement@najm-holding.sa", company: "نجم القابضة", phone: "0555112233", planCode: "enterprise", seats: 85, message: "نبحث عن حلّ وساطة لمجموعتنا (5 كيانات).", status: "new" },
      { id: "lead-demo-2", name: "مجموعة البحر الأحمر", email: "it@redsea-group.sa", company: "مجموعة البحر الأحمر", phone: "0544667788", planCode: "ownership_full", seats: null as number | null, message: "مهتمون بخيار التملّك الكامل ونقل الملكية.", status: "contacted" },
      { id: "lead-demo-3", name: "خالد المطيري", email: "khaled@broker-startup.sa", company: "وساطة ناشئة", phone: "0500998877", planCode: "premium", seats: 12, message: "استفسار عن الأسعار والتجربة المجانية.", status: "new" },
    ];
    for (const l of demoLeads) {
      await prisma.lead.upsert({ where: { id: l.id }, update: { status: l.status }, create: { id: l.id, name: l.name, email: l.email, company: l.company, phone: l.phone, planCode: l.planCode, seats: l.seats, message: l.message, status: l.status } });
    }

    // أهداف أداء لحساب GIB (محسوبة من الإنتاج) — تظهر في /tenant/targets
    const yearStart = new Date("2026-01-01T00:00:00.000Z");
    const demoTargets = [
      { id: "tgt-gib-1", scope: "producer", scopeRefId: "prd-gib-1", metric: "premium", targetValue: 2_000_000 },
      { id: "tgt-gib-2", scope: "producer", scopeRefId: "prd-gib-2", metric: "commissions", targetValue: 150_000 },
    ];
    for (const tg of demoTargets) {
      await prisma.target.upsert({ where: { id: tg.id }, update: { targetValue: tg.targetValue }, create: { id: tg.id, tenantId: GIB_DEF.id, scope: tg.scope, scopeRefId: tg.scopeRefId, metric: tg.metric, period: "year", periodStart: yearStart, targetValue: tg.targetValue, createdBy: "seed" } });
    }

    // شركات التأمين (المؤمِّنون) لحساب GIB — أسماؤها تطابق insurerName على وثائقه فتظهر إحصاءات الإنتاج
    const demoInsurers = [
      { id: "ins-gib-1", name: "شركة التعاونية للتأمين", nameEn: "Tawuniya", licenseNo: "IA-INS-001", vatNumber: "300000000000013", nationalAddress: "طريق الملك فهد، العليا، الرياض 12211", commissionRate: 15, settlementDays: 60, bankName: "الراجحي", iban: "SA0380000000608010111111", contactName: "قسم الوسطاء", contactPhone: "0112180000" },
      { id: "ins-gib-2", name: "بوبا العربية للتأمين", nameEn: "Bupa Arabia", licenseNo: "IA-INS-002", vatNumber: "300000000000023", nationalAddress: "طريق الأمير سلطان، الروضة، جدة 23434", commissionRate: 12.5, settlementDays: 45, bankName: "الأهلي", iban: "SA0380000000608010222222", contactName: "علاقات الوسطاء", contactPhone: "0126982222" },
      { id: "ins-gib-3", name: "شركة ملاذ للتأمين", nameEn: "Malath", licenseNo: "IA-INS-003", vatNumber: "300000000000033", nationalAddress: "طريق العروبة، المروج، الرياض 12283", commissionRate: 17.5, settlementDays: 90, bankName: "الرياض", iban: "SA0380000000608010333333" },
      { id: "ins-gib-4", name: "المتوسط والخليج للتأمين (ميدغلف)", nameEn: "MedGulf", licenseNo: "IA-INS-004", vatNumber: "300000000000043", nationalAddress: "طريق الملك عبدالعزيز، الخبر 34423", commissionRate: 14, settlementDays: 60, bankName: "سامبا", iban: "SA0380000000608010444444" },
    ];
    for (const ins of demoInsurers) {
      await prisma.insurer.upsert({ where: { id: ins.id }, update: { commissionRate: ins.commissionRate, settlementDays: ins.settlementDays, vatNumber: ins.vatNumber, nationalAddress: ins.nationalAddress, status: "active" }, create: { tenantId: GIB_DEF.id, status: "active", ...ins } });
    }

    // هوية بصرية مميّزة لحساب GIB (White-label) — لون كحلي بدل الافتراضي، لعرض الميزة حيًّا
    const gibCfg = await prisma.tenantConfig.findFirst({ where: { tenantId: GIB_DEF.id }, select: { id: true, branding: true } });
    const gibBranding = { ...((gibCfg?.branding ?? {}) as Record<string, unknown>), primary: "#1e3a8a", displayName: "Gulf Insurance Brokers", logoText: "GIB" };
    if (gibCfg) await prisma.tenantConfig.update({ where: { tenantId: GIB_DEF.id }, data: { branding: gibBranding as Prisma.InputJsonValue } });
    else await prisma.tenantConfig.create({ data: { tenantId: GIB_DEF.id, enabledProducts: [], branding: gibBranding as Prisma.InputJsonValue } });
  }

  const [nc, np, ncl] = await Promise.all([prisma.client.count(), prisma.policy.count(), prisma.claim.count()]);
  console.log(`✅ تمّ الزرع: ${TENANTS.length} مستأجر + سوبر أدمن + بيانات شبه واقعية واسعة. كلمة مرور التطوير: ${DEV_PASSWORD}`);
  console.log(`   البيانات: ${nc} عميل · ${np} وثيقة · ${ncl} مطالبة + طلبات/عروض/عمولات/تحقّق/مستندات`);
  console.log("   الخليج (premium+مطالبات): waleed/sara/fahad/laila@gulf-demo.sa");
  console.log("   الأمان (basic): omar@aman-demo.sa");
  if (!isTestDb) console.log("   🏢 Gulf Insurance Brokers Co. (enterprise، ديمو واقعي): AAlanazi@gib-sa.com + pricing/finance/claims/compliance/care@gib-sa.com");
  console.log(`   سوبر أدمن: ${adminEmail}`);
  console.log("   بوّابة العميل: portal@alfahd.sa · portal@naseej.sa · portal@nukhba.sa");
}

main()
  .catch((e) => {
    console.error("❌ فشل الزرع:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
