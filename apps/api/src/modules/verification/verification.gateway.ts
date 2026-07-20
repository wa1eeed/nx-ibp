import { Logger } from "@nestjs/common";

/**
 * بوّابة موفّري التحقّق الحكومي — **نقطة تبديل واحدة** بين Sandbox والموفّرين الفعليين
 * (نفاذ/يقين/واثق/العنوان الوطني). تُختار من `VERIFY_GATEWAY`:
 *  - غير مضبوط/`sandbox` ⇒ بيانات تجريبية (تطوير/عرض).
 *  - `live` ⇒ نداءات HTTP فعلية لكل موفّر **حسب مفاتيحه في البيئة (BYO)**، مع **تراجُع آمن**
 *    إلى Sandbox عند غياب المفتاح أو فشل النداء — تمامًا كنمط البريد/الدفع في المنصّة.
 * لا تبعية خارجية (fetch فقط).
 */
export interface VerificationGateway {
  readonly name: string;
  identity(nationalId: string): Promise<Record<string, unknown>>;
  commercialRegistration(crNumber: string): Promise<Record<string, unknown>>;
  address(id: string): Promise<Record<string, unknown>>;
  screening(name: string): Promise<{ name: string; riskLevel: string; pepMatch: boolean; sanctionsMatch: boolean }>;
}

export const VERIFICATION_GATEWAY = Symbol("VERIFICATION_GATEWAY");

// ————————————————— بيانات Sandbox التجريبية —————————————————
export function sandboxIdentity(nationalId: string): Record<string, unknown> {
  return { nationalId, name: "محمد بن أحمد الشهري", dob: "1990-05-15", gender: "male", nationality: "SA", idExpiry: "2028-03-01", idStatus: "valid" };
}
export function sandboxCr(crNumber: string): Record<string, unknown> {
  return { crNumber, companyName: "شركة العميل التجارية", crStatus: "active", issueCity: "الرياض", partners: ["أحمد الشهري", "سعود القحطاني"], ubo: "أحمد الشهري", authorizedSignatories: ["أحمد الشهري"] };
}
export function sandboxAddress(id: string): Record<string, unknown> {
  return { id, buildingNo: "2347", street: "طريق الملك فهد", district: "العليا", city: "الرياض", postalCode: "12211", additionalNo: "8901" };
}
export function sandboxScreening(name: string): { name: string; riskLevel: string; pepMatch: boolean; sanctionsMatch: boolean } {
  const flagged = /sanction|عقوب|إرهاب/i.test(name);
  return { name, riskLevel: flagged ? "high" : "low", pepMatch: false, sanctionsMatch: flagged };
}

/** بوّابة تجريبية — تُعيد بيانات Sandbox (تطوير/اختبار/عرض). */
export class SandboxVerificationGateway implements VerificationGateway {
  readonly name = "sandbox";
  async identity(nationalId: string) { return sandboxIdentity(nationalId); }
  async commercialRegistration(crNumber: string) { return sandboxCr(crNumber); }
  async address(id: string) { return sandboxAddress(id); }
  async screening(name: string) { return sandboxScreening(name); }
}

/** إعداد موفّر فعلي من البيئة: عنوان القاعدة + المفتاح. مضبوط ⇒ حيّ؛ وإلا ⇒ تراجُع Sandbox. */
export interface ProviderEnv { baseUrl?: string; apiKey?: string }
export function providerEnv(prefix: string, env: NodeJS.ProcessEnv = process.env): ProviderEnv {
  return { baseUrl: env[`${prefix}_BASE_URL`], apiKey: env[`${prefix}_API_KEY`] };
}
export const isConfigured = (p: ProviderEnv): boolean => Boolean(p.baseUrl && p.apiKey);

/**
 * بوّابة الإنتاج — لكل موفّر: إن كانت مفاتيحه مضبوطة، نُنادي endpoint الفعلي (POST JSON بترويسة
 * مصادقة) ونُطابِق الاستجابة على الشكل المتوقّع (مع دمجها فوق افتراضيات Sandbox لسدّ الحقول الناقصة)؛
 * وإلا (أو عند أي فشل) نتراجع إلى Sandbox. آمنة بلا مفاتيح ⇒ لا تكسر النظام.
 */
export class LiveVerificationGateway implements VerificationGateway {
  readonly name = "live";
  private readonly logger = new Logger("VerifyLive");
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  private async call(prefix: string, path: string, payload: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const p = providerEnv(prefix, this.env);
    if (!isConfigured(p)) return null; // غير مضبوط ⇒ تراجُع
    try {
      const res = await fetch(`${p.baseUrl!.replace(/\/$/, "")}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.apiKey!}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { this.logger.warn(`${prefix} ⇒ HTTP ${res.status} (تراجُع Sandbox)`); return null; }
      return (await res.json()) as Record<string, unknown>;
    } catch (e) {
      this.logger.warn(`${prefix} تعذّر النداء (${(e as Error).message}) ⇒ تراجُع Sandbox`);
      return null;
    }
  }

  async identity(nationalId: string) {
    const live = await this.call("YAQEEN", "/identity", { nationalId });
    return { ...sandboxIdentity(nationalId), ...(live ?? {}) };
  }
  async commercialRegistration(crNumber: string) {
    const live = await this.call("WATHIQ", "/cr", { crNumber });
    return { ...sandboxCr(crNumber), ...(live ?? {}) };
  }
  async address(id: string) {
    const live = await this.call("SPL", "/address", { id });
    return { ...sandboxAddress(id), ...(live ?? {}) };
  }
  async screening(name: string) {
    const live = await this.call("SCREENING", "/screen", { name });
    return { ...sandboxScreening(name), ...(live ?? {}) } as { name: string; riskLevel: string; pepMatch: boolean; sanctionsMatch: boolean };
  }
}

/** يختار البوّابة حسب `VERIFY_GATEWAY` (افتراضي Sandbox). */
export function makeVerificationGateway(env: NodeJS.ProcessEnv = process.env): VerificationGateway {
  return (env.VERIFY_GATEWAY ?? "").toLowerCase() === "live" ? new LiveVerificationGateway(env) : new SandboxVerificationGateway();
}

/** مفاتيح الموفّرين وبادئات بيئتها (لعرض حالة الجاهزية على لوحة التكاملات). */
export const VERIFICATION_PROVIDER_ENV: Record<string, string> = {
  nafath: "NAFATH",
  yaqeen: "YAQEEN",
  wathiq: "WATHIQ",
  spl: "SPL",
  screening: "SCREENING",
};
