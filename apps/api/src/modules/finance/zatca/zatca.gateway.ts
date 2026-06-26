import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";

/**
 * بوّابة ZATCA (Fatoora) — **نقطة التكامل الوحيدة** مع واجهات الهيئة.
 * في التطوير تعمل بوضع Sandbox (محاكاة استجابات الهيئة)؛ في الإنتاج (المرحلة 9)
 * تُستبدل أجسام الدوال بنداءات HTTP الحقيقية لبوّابة المطوّرين/المقاصة/الإبلاغ
 * دون تغيير المتعاملين معها (Onboarding/Router).
 */
@Injectable()
export class ZatcaGateway {
  private readonly logger = new Logger(ZatcaGateway.name);
  private sim<T>(label: string, value: T): T {
    this.logger.debug(`[ZATCA-SANDBOX] ${label}`);
    return value;
  }

  /** الخطوة 2: تبادل CSR + OTP ⇒ شهادة الامتثال (CCSID) وسرّ. */
  async exchangeOtpForCcsid(csrPem: string, otp: string): Promise<{ ccsid: string; secret: string; requestId: string }> {
    const fp = createHash("sha256").update(csrPem).digest("hex").slice(0, 16);
    return this.sim("exchangeOtpForCcsid", {
      ccsid: `CCSID-SANDBOX-${fp}-${otp}`,
      secret: createHash("sha256").update(csrPem + otp).digest("base64").slice(0, 32),
      requestId: fp,
    });
  }

  /** الخطوة 3: دفع مستندات الامتثال (UBL) للتحقّق. */
  async runComplianceChecks(ccsid: string, docs: Array<{ type: string; xml: unknown }>): Promise<{ passed: boolean; results: Array<{ type: string; status: string }> }> {
    return this.sim("runComplianceChecks", {
      passed: docs.length >= 3,
      results: docs.map((d) => ({ type: d.type, status: "PASS" })),
    });
  }

  /** الخطوة 4: استبدال CCSID المُتحقَّق ⇒ شهادة الإنتاج (PCSID). */
  async issueProductionCsid(ccsid: string): Promise<{ pcsid: string }> {
    return this.sim("issueProductionCsid", { pcsid: ccsid.replace("CCSID", "PCSID") });
  }

  /** المسار A (B2B): مقاصة فورية ⇒ ختم تشفيري من الهيئة. */
  async clearInvoice(xmlPayload: unknown): Promise<{ cleared: boolean; stamp: string }> {
    const stamp = createHash("sha256").update(JSON.stringify(xmlPayload)).digest("base64");
    return this.sim("clearInvoice", { cleared: true, stamp });
  }

  /** المسار B (B2C): إبلاغ (Reporting) خلال نافذة 24 ساعة. */
  async reportInvoice(xmlPayload: unknown): Promise<{ reported: boolean; ackId: string }> {
    const ackId = createHash("sha256").update(JSON.stringify(xmlPayload)).digest("hex").slice(0, 12);
    return this.sim("reportInvoice", { reported: true, ackId });
  }
}
