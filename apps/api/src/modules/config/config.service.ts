import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@ibp/db";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { StorageService } from "../../common/storage/storage.service";
import { RBAC_MODULES, type RbacModule, type RbacAction } from "../rbac/rbac.constants";

/** خطوة اعتماد إضافية قابلة للتهيئة ضمن سلسلة اعتماد الوثيقة (E2). */
export interface ApprovalStep {
  key: string; // مُعرّف فريد (slug) داخل السلسلة
  name: string; // اسم معروض
  module: RbacModule; // الوحدة المطلوبة صلاحيتها للموافقة على هذه الخطوة
  action: RbacAction; // الفعل المطلوب (افتراضي update)
}

const ACTIONS: RbacAction[] = ["read", "create", "update", "delete"];
const asJson = (v: unknown) => v as Prisma.InputJsonValue;

/** بيانات شركة الوساطة (Tenant) القابلة للعرض/التعديل في صفحة الشركة. */
export interface CompanyInfo {
  name: string;
  nameEn: string | null;
  crNumber: string | null;
  unifiedNumber: string | null; // 10 أرقام
  vatNumber: string | null; // 15 رقمًا
  phone: string | null; // 05XXXXXXXX
  // العنوان الوطني (فاتورة ZATCA)
  buildingNo: string | null;
  street: string | null;
  district: string | null;
  city: string | null;
  postalCode: string | null;
  createdAt: Date | null;
}

/** يتحقّق أن الرقم بعدد الخانات المطلوب (فارغ ⇒ null). */
function validateDigits(v: unknown, len: number, label: string): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (!new RegExp(`^\\d{${len}}$`).test(s)) throw new BadRequestException(`${label} يجب أن يكون ${len} أرقام`);
  return s;
}

/** يتحقّق من صيغة جوال سعودي 05XXXXXXXX (فارغ ⇒ null). */
function validatePhone(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (!/^05\d{8}$/.test(s)) throw new BadRequestException("رقم الجوال يجب أن يكون بصيغة 05XXXXXXXX");
  return s;
}

/** الهوية البصرية للمستأجر (White-label). القيم null ⇒ استخدام هوية NX-IBP الافتراضية. */
export interface TenantBranding {
  primary: string; // اللون الأساسي (hex)
  displayName: string | null; // اسم المنصة المعروض للمستأجر
  logoUrl: string | null; // رابط الشعار المرفوع
  faviconUrl: string | null; // رابط أيقونة التبويب (اختياري)
  logoText: string | null; // شعار نصّي بديل عند غياب الصورة
}

const DEFAULT_PRIMARY = "#0d9488";
const HEX_RE = /^#([0-9a-fA-F]{6})$/;

/** يتحقّق أن اللون بصيغة hex سداسية (#RRGGBB)؛ يرمي 400 وإلا. */
function validateHex(v: string): string {
  const s = String(v).trim();
  if (!HEX_RE.test(s)) throw new BadRequestException("اللون يجب أن يكون بصيغة hex سداسية مثل #0d9488");
  return s.toLowerCase();
}

/** مسار تخزين شعار المستأجر (ضمن مساره المعزول). */
function logoKey(tenantId: string): string {
  return `tenant_${tenantId}/branding/logo`;
}

/** العنوان العام للـAPI (لبناء رابط الشعار الثابت المضمَّن في البريد). */
function publicApiBase(): string {
  return process.env.API_PUBLIC_URL ?? process.env.NEXT_PUBLIC_API_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`;
}

/** يطبّع كائن الهوية من التخزين (JSON) بالقيم الافتراضية. */
function normalizeBranding(raw: unknown): TenantBranding {
  const b = (raw ?? {}) as Record<string, unknown>;
  const primary = typeof b.primary === "string" && HEX_RE.test(b.primary) ? b.primary.toLowerCase() : DEFAULT_PRIMARY;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    primary,
    displayName: str(b.displayName),
    logoUrl: str(b.logoUrl),
    faviconUrl: str(b.faviconUrl),
    logoText: str(b.logoText) ?? "IBP",
  };
}

/** إعداد سلسلة اعتماد الوثيقة: بوّابة الموافقة الفنية + فصل المهام + خطوات إضافية. */
export interface PolicyApprovalConfig {
  technicalGate: boolean; // هل الموافقة الفنية مطلوبة؟ (افتراضي true)
  segregationOfDuties: boolean; // فصل المهام: المعتمِد المالي ≠ المُصدِر (افتراضي true — توصية رقابية)
  extraSteps: ApprovalStep[];
}

/**
 * إعدادات المستأجر القابلة للتهيئة (E2 وما بعده). حاليًا: **سلاسل اعتماد الوثيقة** —
 * خطوات موافقة إضافية (بين الفني والمالي) يعرّفها مالك الحساب، لكل خطوة وحدتها/فعلها المطلوب.
 * فارغة = السلسلة الافتراضية (فني ⇒ مالي). معزول بالمستأجر.
 */
@Injectable()
export class ConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  /** إعداد سلسلة اعتماد الوثيقة: بوّابة فنية (افتراضي مفعّلة) + خطوات إضافية. */
  async getPolicyApprovalConfig(tenantId: string): Promise<PolicyApprovalConfig> {
    const cfg = await this.prisma.tenantConfig.findFirst({ where: { tenantId }, select: { approvalChains: true } });
    const policy = ((cfg?.approvalChains ?? {}) as { policy?: { technicalGate?: boolean; segregationOfDuties?: boolean; extraSteps?: ApprovalStep[] } }).policy ?? {};
    return {
      technicalGate: policy.technicalGate !== false, // افتراضيًا مفعّلة
      segregationOfDuties: policy.segregationOfDuties !== false, // افتراضيًا مفعّل
      extraSteps: Array.isArray(policy.extraSteps) ? policy.extraSteps : [],
    };
  }

  /** خطوات الاعتماد الإضافية فقط (مرتّبة). */
  async getPolicyApprovalSteps(tenantId: string): Promise<ApprovalStep[]> {
    return (await this.getPolicyApprovalConfig(tenantId)).extraSteps;
  }

  /** يحفظ إعداد سلسلة اعتماد الوثيقة (البوّابة الفنية + الخطوات) بعد التحقّق. */
  async setPolicyApprovalConfig(tenantId: string, userId: string, input: { technicalGate?: boolean; segregationOfDuties?: boolean; steps: ApprovalStep[] }): Promise<{ ok: true } & PolicyApprovalConfig> {
    const extraSteps = this.validate(input.steps);
    const technicalGate = input.technicalGate !== false;
    const segregationOfDuties = input.segregationOfDuties !== false;
    const cfg = await this.prisma.tenantConfig.findFirst({ where: { tenantId }, select: { id: true, approvalChains: true } });
    const chains = { ...((cfg?.approvalChains ?? {}) as Record<string, unknown>), policy: { technicalGate, segregationOfDuties, extraSteps } };
    if (cfg) await this.prisma.tenantConfig.update({ where: { tenantId }, data: { approvalChains: asJson(chains) } });
    else await this.prisma.tenantConfig.create({ data: { tenantId, enabledProducts: [], approvalChains: asJson(chains) } });
    await this.audit.log({ tenantId, userId, action: "update", entity: "approval_chain", entityId: "policy", meta: { technicalGate, segregationOfDuties, steps: extraSteps.length } });
    return { ok: true, technicalGate, segregationOfDuties, extraSteps };
  }

  // ————————————————— سياسة الأمان (إلزام MFA) —————————————————

  /** سياسة الأمان على مستوى الشركة. حاليًا: إلزام المصادقة الثنائية لكل الموظفين. */
  async getSecurityConfig(tenantId: string): Promise<{ mfaRequired: boolean }> {
    const cfg = await this.prisma.tenantConfig.findFirst({ where: { tenantId }, select: { securityPolicy: true } });
    const sp = (cfg?.securityPolicy ?? {}) as { mfaRequired?: boolean };
    return { mfaRequired: sp.mfaRequired === true };
  }

  /** يحفظ سياسة الأمان. تفعيل الإلزام لا يُعطّل دخول من لم يُسجّل بعد، بل تدفعه الواجهة للتسجيل. */
  async setSecurityConfig(tenantId: string, userId: string, input: { mfaRequired: boolean }): Promise<{ ok: true; mfaRequired: boolean }> {
    const mfaRequired = input.mfaRequired === true;
    const cfg = await this.prisma.tenantConfig.findFirst({ where: { tenantId }, select: { id: true, securityPolicy: true } });
    const policy = { ...((cfg?.securityPolicy ?? {}) as Record<string, unknown>), mfaRequired };
    if (cfg) await this.prisma.tenantConfig.update({ where: { tenantId }, data: { securityPolicy: asJson(policy) } });
    else await this.prisma.tenantConfig.create({ data: { tenantId, enabledProducts: [], securityPolicy: asJson(policy) } });
    await this.audit.log({ tenantId, userId, action: "update", entity: "security_policy", entityId: "mfa", meta: { mfaRequired } });
    return { ok: true, mfaRequired };
  }

  // ————————————————— بيانات الشركة (Company) —————————————————

  /** بيانات شركة الوساطة (للعرض/التعديل في صفحة الشركة). */
  async getCompany(tenantId: string): Promise<CompanyInfo> {
    const t = await this.prisma.tenant.findFirst({
      where: { id: tenantId },
      select: { name: true, nameEn: true, crNumber: true, unifiedNumber: true, vatNumber: true, phone: true, buildingNo: true, street: true, district: true, city: true, postalCode: true, createdAt: true },
    });
    return {
      name: t?.name ?? "",
      nameEn: t?.nameEn ?? null,
      crNumber: t?.crNumber ?? null,
      unifiedNumber: t?.unifiedNumber ?? null,
      vatNumber: t?.vatNumber ?? null,
      phone: t?.phone ?? null,
      buildingNo: t?.buildingNo ?? null,
      street: t?.street ?? null,
      district: t?.district ?? null,
      city: t?.city ?? null,
      postalCode: t?.postalCode ?? null,
      createdAt: t?.createdAt ?? null,
    };
  }

  /** يحفظ بيانات الشركة بعد التحقّق (الاسم مطلوب؛ الأرقام بأطوالها الصحيحة إن أُدخلت). */
  async setCompany(tenantId: string, userId: string, input: Partial<CompanyInfo>): Promise<{ ok: true } & CompanyInfo> {
    const data: Record<string, string | null> = {};
    if (input.name !== undefined) {
      const name = String(input.name).trim();
      if (name.length < 2) throw new BadRequestException("اسم الشركة مطلوب (حرفان على الأقل)");
      data.name = name;
    }
    if (input.nameEn !== undefined) data.nameEn = String(input.nameEn).trim() || null;
    if (input.crNumber !== undefined) data.crNumber = String(input.crNumber).trim() || null;
    if (input.unifiedNumber !== undefined) data.unifiedNumber = validateDigits(input.unifiedNumber, 10, "الرقم الموحّد");
    if (input.vatNumber !== undefined) data.vatNumber = validateDigits(input.vatNumber, 15, "الرقم الضريبي");
    if (input.phone !== undefined) data.phone = validatePhone(input.phone);
    if (input.buildingNo !== undefined) data.buildingNo = String(input.buildingNo).trim() || null;
    if (input.street !== undefined) data.street = String(input.street).trim() || null;
    if (input.district !== undefined) data.district = String(input.district).trim() || null;
    if (input.city !== undefined) data.city = String(input.city).trim() || null;
    if (input.postalCode !== undefined) data.postalCode = String(input.postalCode).trim() || null;
    if (Object.keys(data).length) await this.prisma.tenant.update({ where: { id: tenantId }, data });
    await this.audit.log({ tenantId, userId, action: "update", entity: "company", entityId: tenantId, meta: { fields: Object.keys(data) } });
    return { ok: true, ...(await this.getCompany(tenantId)) };
  }

  // ————————————————— الهوية البصرية (White-label — P0-B) —————————————————

  /** الهوية البصرية للمستأجر (شعار/لون/اسم عرض). القيم الافتراضية = هوية NX-IBP. */
  async getBranding(tenantId: string): Promise<TenantBranding> {
    const cfg = await this.prisma.tenantConfig.findFirst({ where: { tenantId }, select: { branding: true } });
    return normalizeBranding(cfg?.branding);
  }

  /** يكتب حقول الهوية (merge على الـJSON الخام كي تبقى الحقول الداخلية مثل logoMime). */
  private async writeBranding(tenantId: string, patch: Record<string, unknown>): Promise<void> {
    const cfg = await this.prisma.tenantConfig.findFirst({ where: { tenantId }, select: { id: true, branding: true } });
    const raw = { ...((cfg?.branding ?? {}) as Record<string, unknown>), ...patch };
    if (cfg) await this.prisma.tenantConfig.update({ where: { tenantId }, data: { branding: asJson(raw) } });
    else await this.prisma.tenantConfig.create({ data: { tenantId, enabledProducts: [], branding: asJson(raw) } });
  }

  /** يحفظ الهوية البصرية بعد التحقّق من صحّة اللون (hex) — ينعكس فورًا على الواجهة/البوّابة/البريد/الوثائق. */
  async setBranding(tenantId: string, userId: string, input: Partial<TenantBranding>): Promise<{ ok: true } & TenantBranding> {
    const patch: Record<string, unknown> = {};
    if (input.primary !== undefined) patch.primary = validateHex(input.primary);
    if (input.displayName !== undefined) patch.displayName = String(input.displayName).trim() || null;
    if (input.logoUrl !== undefined) patch.logoUrl = String(input.logoUrl).trim() || null;
    if (input.faviconUrl !== undefined) patch.faviconUrl = String(input.faviconUrl).trim() || null;
    if (input.logoText !== undefined) patch.logoText = String(input.logoText).trim().slice(0, 24) || null;
    await this.writeBranding(tenantId, patch);
    const next = await this.getBranding(tenantId);
    await this.audit.log({ tenantId, userId, action: "update", entity: "branding", entityId: "tenant", meta: { primary: next.primary, hasLogo: !!next.logoUrl } });
    return { ok: true, ...next };
  }

  /**
   * رفع شعار المستأجر (data URL base64). يُخزَّن خادميًا ويُخدَم عبر رابط عام ثابت
   * (لأن الشعار يظهر في بريد يصل لعملاء خارجيين — يلزم رابط دائم لا موقّت).
   */
  async uploadLogo(tenantId: string, userId: string, dataUrl: string): Promise<{ ok: true } & TenantBranding> {
    const m = /^data:(image\/(png|jpeg|jpg|webp|gif|svg\+xml));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
    if (!m) throw new BadRequestException("صيغة الشعار غير مدعومة (PNG/JPG/WebP/GIF/SVG فقط)");
    const mime = m[1];
    const data = Buffer.from(m[3], "base64");
    if (data.length > 512 * 1024) throw new BadRequestException("حجم الشعار يتجاوز 512 كيلوبايت");
    await this.storage.put(logoKey(tenantId), data);
    const url = `${publicApiBase()}/branding/${tenantId}/logo?v=${data.length}`;
    await this.writeBranding(tenantId, { logoUrl: url, logoMime: mime });
    const next = await this.getBranding(tenantId);
    await this.audit.log({ tenantId, userId, action: "update", entity: "branding", entityId: "logo", meta: { bytes: data.length, mime } });
    return { ok: true, ...next };
  }

  /** بايتات الشعار + نوعه للخدمة العامة (بلا مصادقة — الشعار ليس سرًّا). */
  async getLogo(tenantId: string): Promise<{ data: Buffer; mime: string } | null> {
    const cfg = await this.prisma.tenantConfig.findFirst({ where: { tenantId }, select: { branding: true } });
    const mime = ((cfg?.branding ?? {}) as { logoMime?: string }).logoMime;
    if (!mime) return null;
    try {
      const data = await this.storage.get(logoKey(tenantId));
      return { data, mime };
    } catch {
      return null;
    }
  }

  // ————————————————— سياسة الاحتفاظ (الإتلاف الآمن — PDPL) —————————————————

  /** مدّة الاحتفاظ بالبيانات (سنوات). الافتراضي 10 (سجلّات التأمين — هيئة التأمين IA). */
  async getRetentionConfig(tenantId: string): Promise<{ retentionYears: number }> {
    const cfg = await this.prisma.tenantConfig.findFirst({ where: { tenantId }, select: { securityPolicy: true } });
    const y = ((cfg?.securityPolicy ?? {}) as { retentionYears?: number }).retentionYears;
    return { retentionYears: typeof y === "number" && y > 0 ? y : 10 };
  }

  /** يحفظ مدّة الاحتفاظ (1–30 سنة) ضمن سياسة الأمان. */
  async setRetentionConfig(tenantId: string, userId: string, input: { retentionYears: number }): Promise<{ ok: true; retentionYears: number }> {
    const retentionYears = Math.round(input.retentionYears);
    if (!Number.isFinite(retentionYears) || retentionYears < 1 || retentionYears > 30) {
      throw new BadRequestException("مدّة الاحتفاظ يجب أن تكون بين 1 و30 سنة");
    }
    const cfg = await this.prisma.tenantConfig.findFirst({ where: { tenantId }, select: { id: true, securityPolicy: true } });
    const policy = { ...((cfg?.securityPolicy ?? {}) as Record<string, unknown>), retentionYears };
    if (cfg) await this.prisma.tenantConfig.update({ where: { tenantId }, data: { securityPolicy: asJson(policy) } });
    else await this.prisma.tenantConfig.create({ data: { tenantId, enabledProducts: [], securityPolicy: asJson(policy) } });
    await this.audit.log({ tenantId, userId, action: "update", entity: "retention_policy", entityId: "client", meta: { retentionYears } });
    return { ok: true, retentionYears };
  }

  /** يتحقّق من صحّة الخطوات (مفاتيح فريدة غير فارغة، وحدة/فعل صالحان). */
  private validate(steps: ApprovalStep[]): ApprovalStep[] {
    if (!Array.isArray(steps)) throw new BadRequestException("سلسلة الاعتماد يجب أن تكون قائمة خطوات");
    const seen = new Set<string>();
    return steps.map((s, i) => {
      const key = String(s.key ?? "").trim();
      if (!key) throw new BadRequestException(`الخطوة ${i + 1}: مفتاح مطلوب`);
      if (seen.has(key)) throw new BadRequestException(`الخطوة ${i + 1}: المفتاح «${key}» مكرّر`);
      seen.add(key);
      if (!(RBAC_MODULES as readonly string[]).includes(s.module)) throw new BadRequestException(`الخطوة «${key}»: وحدة غير معروفة`);
      const action = (s.action ?? "update") as RbacAction;
      if (!ACTIONS.includes(action)) throw new BadRequestException(`الخطوة «${key}»: فعل غير معروف`);
      return { key, name: String(s.name ?? key).trim() || key, module: s.module, action };
    });
  }
}
