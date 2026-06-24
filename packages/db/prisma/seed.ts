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

// مصفوفة الموديولز لكل باقة (entitlement: module.<x>)
const PLAN_MODULES: Record<string, Record<string, EntMode>> = {
  basic: { clients: "INCLUDED", sales: "INCLUDED", production: "INCLUDED", service: "INCLUDED", finance: "INCLUDED", claims: "DISABLED", reports: "DISABLED", compliance: "DISABLED", hr: "DISABLED" },
  premium: { clients: "INCLUDED", sales: "INCLUDED", production: "INCLUDED", service: "INCLUDED", finance: "INCLUDED", claims: "ADDON", reports: "ADDON", compliance: "ADDON", hr: "DISABLED" },
  enterprise: { clients: "INCLUDED", sales: "INCLUDED", production: "INCLUDED", service: "INCLUDED", finance: "INCLUDED", claims: "INCLUDED", reports: "INCLUDED", compliance: "INCLUDED", hr: "INCLUDED" },
};

// ميزات غير الموديولز لكل باقة
const PLAN_FEATURES: Record<string, Array<{ key: string; mode: EntMode; numericValue?: number; unitFee?: number }>> = {
  basic: [{ key: "upload.maxFileMb", mode: "QUOTA", numericValue: 10 }],
  premium: [
    { key: "upload.maxFileMb", mode: "QUOTA", numericValue: 25 },
    { key: "dynamic_form", mode: "METERED", unitFee: 1.5 },
    { key: "verification.yaqeen", mode: "METERED", unitFee: 3.0 },
  ],
  enterprise: [
    { key: "upload.maxFileMb", mode: "QUOTA", numericValue: 100 },
    { key: "dynamic_form", mode: "INCLUDED" },
    { key: "verification.yaqeen", mode: "INCLUDED" },
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
    plan: "premium",
    billing: "RESELLER",
    seatsUsed: 4,
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
    addons: ["module.claims", "module.reports"], // اشترى موديولَي المطالبات والتقارير
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
  const plans: Array<Prisma.PlanCreateInput> = [
    { code: "basic", name: "الأساسية", seatLimit: 5, priceMonthly: 499, priceYearly: 4990 },
    { code: "premium", name: "الاحترافية", seatLimit: 20, priceMonthly: 1499, priceYearly: 14990 },
    { code: "enterprise", name: "المؤسسات", seatLimit: 100, priceMonthly: 4999, priceYearly: 49990 },
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
    update: { planId: plan.id, seatsUsed: def.seatsUsed },
    create: { id: `sub-${def.id}`, tenantId: def.id, planId: plan.id, cycle: "YEARLY", seatsUsed: def.seatsUsed },
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

  for (const u of def.users) {
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId: def.id, email: u.email } },
      update: { fullName: u.name, roleId: `role-${def.id}-${u.role}`, passwordHash },
      create: { tenantId: def.id, email: u.email, fullName: u.name, status: "ACTIVE", roleId: `role-${def.id}-${u.role}`, passwordHash },
    });
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
  { path: [1, 1], name: "الأصول المتداولة", type: "asset", onBal: true },
  { path: [1, 3], name: "ذمم العملاء المدينة", type: "asset", onBal: true },
  { path: [2], name: "الخصوم", type: "liability", onBal: true },
  { path: [2, 1], name: "ذمم شركات التأمين الدائنة", type: "liability", onBal: true },
  { path: [2, 2], name: "أمانات أقساط العملاء (خارج الميزانية)", type: "liability", onBal: false },
  { path: [3], name: "حقوق الملكية", type: "equity", onBal: true },
  { path: [4], name: "الإيرادات", type: "revenue", onBal: true },
  { path: [4, 1], name: "عمولات الوساطة", type: "revenue", onBal: true },
  { path: [5], name: "المصروفات", type: "expense", onBal: true },
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
      isLocked: level <= 2, // المستوى 1/2 مقفل
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
    { id: "pol-shorouq-mot", t: "demo-tenant", clientId: "cl-shorouq", line: "MCI", insurer: "التعاونية للتأمين", net: 60000, comm: 10, start: "2025-07-15", end: "2026-07-14" }, // مستحقّة للتجديد قريباً
    { id: "pol-nukhba-mot", t: "demo-tenant-2", clientId: "cl2-nukhba", line: "MTP", insurer: "سلامة للتأمين", net: 28000, comm: 8, start: "2026-04-01", end: "2027-03-31" },
  ];
  let pi = 0;
  for (const p of policies) {
    pi++;
    const vat = round2(p.net * 0.15);
    const total = round2(p.net + vat);
    await prisma.policy.upsert({
      where: { id: p.id },
      update: { insurerName: p.insurer, premium: p.net, vat, totalPremium: total, status: "ISSUED" },
      create: {
        id: p.id, tenantId: p.t, clientId: p.clientId, productLineCode: p.line, insurerName: p.insurer,
        sequenceNo: `POL-RUH-${p.line}-2026-${1000 + pi}`, premium: p.net, vat, totalPremium: total,
        commissionRate: p.comm, commissionAmount: round2((p.net * p.comm) / 100), status: "ISSUED",
        startDate: D(p.start), endDate: D(p.end),
      },
    });
    await prisma.debitNote.upsert({
      where: { id: `dn-${p.id}` }, update: {},
      create: { id: `dn-${p.id}`, tenantId: p.t, clientId: p.clientId, policyId: p.id, sequenceNo: `DN-2026-${1000 + pi}`, netAmount: p.net, vatAmount: vat },
    });
    await prisma.invoice.upsert({
      where: { id: `inv-${p.id}` }, update: {},
      create: {
        id: `inv-${p.id}`, tenantId: p.t, policyId: p.id, insurerName: p.insurer, sequenceNo: `INV-2026-${1000 + pi}`,
        netAmount: p.net, vatAmount: vat, totalAmount: total, status: "issued",
        zatcaUuid: `zatca-${p.id}`, zatcaHash: "demo-hash", qrPayload: "demo-qr",
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

async function main() {
  console.log("🌱 IBP seed — بيانات وهمية فقط");
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);

  await seedPlans();
  await seedCatalog();
  await seedProviders();

  for (const def of TENANTS) {
    await seedTenant(def, passwordHash);
    await prisma.auditLog.create({
      data: { tenantId: def.id, action: "seed", entity: "system", meta: { note: "dev seed (mock data only)" } },
    });
  }

  await seedOperations(passwordHash);

  // مالك المنصة (سوبر أدمن)
  await prisma.platformAdmin.upsert({
    where: { email: "admin@ibp-platform.sa" },
    update: { passwordHash },
    create: { email: "admin@ibp-platform.sa", fullName: "مالك المنصة", passwordHash },
  });

  console.log(`✅ تمّ الزرع: ${TENANTS.length} مستأجر + سوبر أدمن + بيانات تشغيلية. كلمة مرور التطوير: ${DEV_PASSWORD}`);
  console.log("   الخليج (premium+مطالبات): waleed/sara/fahad/laila@gulf-demo.sa");
  console.log("   الأمان (basic): omar@aman-demo.sa");
  console.log("   سوبر أدمن: admin@ibp-platform.sa");
  console.log("   بوّابة العميل: portal@alfahd.sa (الفهد) · portal@nukhba.sa (النخبة)");
}

main()
  .catch((e) => {
    console.error("❌ فشل الزرع:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
