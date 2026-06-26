import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import { CryptoVaultService } from "../../../common/crypto/crypto-vault.service";
import { ZatcaCryptoService } from "../../../common/zatca/zatca-crypto.service";
import { AuditService } from "../../../common/audit/audit.service";
import { ZatcaGateway } from "./zatca.gateway";

/**
 * خطّ تهيئة المستأجر مع ZATCA (Fatoora Onboarding) — أربع خطوات تدريجية:
 * توليد CSR ⇒ تبادل OTP للحصول على CCSID ⇒ فحوص الامتثال ⇒ تفعيل PCSID.
 * كل بيانات الاعتماد مشفّرة at-rest ومعزولة بالمستأجر.
 */
@Injectable()
export class ZatcaOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly zatca: ZatcaCryptoService,
    private readonly vault: CryptoVaultService,
    private readonly gateway: ZatcaGateway,
    private readonly audit: AuditService,
  ) {}

  private async require(tenantId: string) {
    const cfg = await this.prisma.tenantZatcaConfig.findFirst({ where: { tenantId } });
    if (!cfg) throw new NotFoundException("لا توجد تهيئة ZATCA — احفظ بيانات المنشأة أولاً");
    return cfg;
  }

  async getConfig(tenantId: string) {
    const cfg = await this.prisma.tenantZatcaConfig.findFirst({ where: { tenantId } });
    if (!cfg) return null;
    return {
      vatNumber: cfg.vatNumber, businessNameAr: cfg.businessNameAr, businessNameEn: cfg.businessNameEn,
      environment: cfg.environment, egsSerialNumber: cfg.egsSerialNumber, onboardingStatus: cfg.onboardingStatus,
      hasCsr: !!cfg.csrPem, hasPrivateKey: !!cfg.privateKeyEnc,
      complianceCsid: this.vault.mask(cfg.complianceCsidEnc), productionCsid: this.vault.mask(cfg.productionCsidEnc),
      invoiceCounter: cfg.invoiceCounter, lastActivatedAt: cfg.lastActivatedAt,
    };
  }

  /** حفظ/تحديث بيانات المنشأة (مع التحقّق من الرقم الضريبي). */
  async upsertConfig(tenantId: string, dto: { vatNumber: string; businessNameAr: string; businessNameEn?: string; egsSerialNumber?: string }) {
    if (!this.zatca.isValidVat(dto.vatNumber)) {
      throw new UnprocessableEntityException("الرقم الضريبي غير صالح: يجب 15 رقماً يبدأ وينتهي بـ 3");
    }
    const cfg = await this.prisma.tenantZatcaConfig.upsert({
      where: { tenantId },
      update: { vatNumber: dto.vatNumber, businessNameAr: dto.businessNameAr, businessNameEn: dto.businessNameEn ?? null, egsSerialNumber: dto.egsSerialNumber ?? undefined },
      create: { tenantId, vatNumber: dto.vatNumber, businessNameAr: dto.businessNameAr, businessNameEn: dto.businessNameEn ?? null, egsSerialNumber: dto.egsSerialNumber ?? `EGS-${tenantId}` },
    });
    return this.getConfig(cfg.tenantId);
  }

  /** الخطوة 1: توليد المفتاح الخاص (ECDSA secp256k1) و CSR. */
  async generateCsr(tenantId: string, userId: string) {
    const cfg = await this.require(tenantId);
    if (!this.zatca.isValidVat(cfg.vatNumber)) throw new UnprocessableEntityException("الرقم الضريبي غير صالح");
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId }, select: { crNumber: true } });
    const egsSerial = cfg.egsSerialNumber ?? `EGS-${tenantId}`;
    const { privateKeyPem, publicKeyPem, csrPem } = this.zatca.generateEgsKeyAndCsr({
      vatNumber: cfg.vatNumber, businessName: cfg.businessNameAr, crNumber: tenant?.crNumber ?? null, egsSerial,
    });
    await this.prisma.tenantZatcaConfig.update({
      where: { tenantId },
      data: { privateKeyEnc: this.vault.encrypt(privateKeyPem), publicKey: publicKeyPem, csrPem, egsSerialNumber: egsSerial, onboardingStatus: "CSR_GENERATED" },
    });
    await this.audit.log({ tenantId, userId, action: "create", entity: "zatca_csr", entityId: tenantId });
    return { onboardingStatus: "CSR_GENERATED", csrPem };
  }

  /** الخطوة 2: تبادل CSR + OTP ⇒ شهادة الامتثال (CCSID). */
  async exchangeOtp(tenantId: string, userId: string, otp: string) {
    const cfg = await this.require(tenantId);
    if (cfg.onboardingStatus === "NOT_STARTED" || !cfg.csrPem) throw new ConflictException("ولّد CSR أولاً (الخطوة 1)");
    const res = await this.gateway.exchangeOtpForCcsid(cfg.csrPem, otp);
    await this.prisma.tenantZatcaConfig.update({ where: { tenantId }, data: { complianceCsidEnc: this.vault.encrypt(res.ccsid) } });
    await this.audit.log({ tenantId, userId, action: "update", entity: "zatca_ccsid", entityId: tenantId, meta: { requestId: res.requestId } });
    return { onboardingStatus: cfg.onboardingStatus, complianceCsid: this.vault.mask(this.vault.encrypt(res.ccsid)) };
  }

  /** الخطوة 3: دفع 3 مستندات امتثال (فاتورة/إشعار دائن/إشعار مدين) للتحقّق. */
  async runCompliance(tenantId: string, userId: string) {
    const cfg = await this.require(tenantId);
    if (!cfg.complianceCsidEnc) throw new ConflictException("بادِل OTP للحصول على CCSID أولاً (الخطوة 2)");
    const ccsid = this.vault.decrypt(cfg.complianceCsidEnc);
    const sup = { name: cfg.businessNameAr, vat: cfg.vatNumber };
    const cust = { name: "عميل اختبار", vat: null, crOrId: "1010000000", address: "الرياض" };
    const line = { description: "تأمين تجريبي", quantity: 1, unitPrice: 100, vatRate: 15, vatAmount: 15, net: 100 };
    const mk = (type: string) => this.zatca.buildUbl({ uuid: this.zatca.uuidV4(), serialNumber: `TEST-${type}`, documentType: type, issueDate: "2026-01-01", issueTimestamp: "2026-01-01T00:00:00Z", supplier: sup, customer: cust, lines: [line], totalExclVat: 100, totalVat: 15, totalInclVat: 115 });
    const docs = [
      { type: "TAX_INVOICE", xml: mk("TAX_INVOICE") },
      { type: "CREDIT_NOTE", xml: mk("CREDIT_NOTE") },
      { type: "DEBIT_NOTE", xml: mk("DEBIT_NOTE") },
    ];
    const res = await this.gateway.runComplianceChecks(ccsid, docs);
    if (!res.passed) throw new ConflictException("فشلت فحوص الامتثال");
    await this.prisma.tenantZatcaConfig.update({ where: { tenantId }, data: { onboardingStatus: "COMPLIANCE_PASSED" } });
    await this.audit.log({ tenantId, userId, action: "approve", entity: "zatca_compliance", entityId: tenantId, meta: { count: docs.length } });
    return { onboardingStatus: "COMPLIANCE_PASSED", results: res.results };
  }

  /** الخطوة 4: استبدال CCSID ⇒ شهادة الإنتاج (PCSID) وتفعيل المستأجر. */
  async finalize(tenantId: string, userId: string) {
    const cfg = await this.require(tenantId);
    if (cfg.onboardingStatus !== "COMPLIANCE_PASSED") throw new ConflictException("اجتز فحوص الامتثال أولاً (الخطوة 3)");
    const ccsid = this.vault.decrypt(cfg.complianceCsidEnc!);
    const { pcsid } = await this.gateway.issueProductionCsid(ccsid);
    await this.prisma.tenantZatcaConfig.update({
      where: { tenantId },
      data: { productionCsidEnc: this.vault.encrypt(pcsid), onboardingStatus: "ACTIVE", environment: "PRODUCTION", lastActivatedAt: new Date() },
    });
    await this.audit.log({ tenantId, userId, action: "approve", entity: "zatca_activation", entityId: tenantId });
    return { onboardingStatus: "ACTIVE", productionCsid: this.vault.mask(this.vault.encrypt(pcsid)) };
  }
}
