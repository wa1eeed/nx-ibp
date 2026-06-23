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
    addons: ["module.claims"], // اشترى موديول المطالبات
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

  console.log(`✅ تمّ الزرع: ${TENANTS.length} مستأجر. كلمة مرور التطوير: ${DEV_PASSWORD}`);
  console.log("   الخليج (premium+مطالبات): waleed/sara/fahad/laila@gulf-demo.sa");
  console.log("   الأمان (basic): omar@aman-demo.sa");
}

main()
  .catch((e) => {
    console.error("❌ فشل الزرع:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
