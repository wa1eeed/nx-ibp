import { HttpException, HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";

/**
 * طبقة موفّري التحقّق (المرحلة 7) — تعمل عبر Sandbox تجريبي أولاً (CLAUDE.md/BLUEPRINT).
 * تربط التحقّق بالعميل/الطلب، تخصم العمليات من المحفظة (نموذج Reseller) وتسجّلها،
 * وتُعيد البيانات لتعبئة النموذج ذكياً. الأرقام تقديرية وقابلة للتهيئة (لا تُكتب نهائياً).
 */
interface CheckConfig {
  providerKey: string;
  checkType: string;
  cost: number; // SAR — تقديري
  walletService?: string; // الخدمة التي تُخصم منها العملية (إن كانت مدفوعة)
}

const CONFIG: Record<string, CheckConfig> = {
  yaqeen: { providerKey: "yaqeen", checkType: "identity", cost: 3, walletService: "yaqeen" },
  wathiq: { providerKey: "wathiq", checkType: "cr", cost: 5, walletService: "wathiq" },
  address: { providerKey: "spl", checkType: "address", cost: 0 }, // مجاني
  screening: { providerKey: "screening", checkType: "pep_sanctions", cost: 0 },
};

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ----- بيانات Sandbox تجريبية (تُستبدل بالـ APIs الحقيقية في المرحلة 9) -----
  private mockYaqeen(nationalId: string) {
    return { nationalId, name: "محمد بن أحمد الشهري", dob: "1990-05-15", gender: "male", nationality: "SA", idExpiry: "2028-03-01", idStatus: "valid" };
  }
  private mockWathiq(crNumber: string) {
    return { crNumber, companyName: "شركة العميل التجارية", crStatus: "active", issueCity: "الرياض", partners: ["أحمد الشهري", "سعود القحطاني"], ubo: "أحمد الشهري", authorizedSignatories: ["أحمد الشهري"] };
  }
  private mockAddress(id: string) {
    return { id, buildingNo: "2347", street: "طريق الملك فهد", district: "العليا", city: "الرياض", postalCode: "12211", additionalNo: "8901" };
  }
  private mockScreening(name: string) {
    const flagged = /sanction|عقوب|إرهاب/i.test(name);
    return { name, riskLevel: flagged ? "high" : "low", pepMatch: false, sanctionsMatch: flagged };
  }

  yaqeen(tenantId: string, userId: string, nationalId: string, clientId?: string) {
    return this.perform(tenantId, userId, "yaqeen", this.mockYaqeen(nationalId), clientId);
  }
  wathiq(tenantId: string, userId: string, crNumber: string, clientId?: string) {
    return this.perform(tenantId, userId, "wathiq", this.mockWathiq(crNumber), clientId);
  }
  address(tenantId: string, userId: string, id: string, clientId?: string) {
    return this.perform(tenantId, userId, "address", this.mockAddress(id), clientId);
  }
  screening(tenantId: string, userId: string, name: string, clientId?: string) {
    const result = this.mockScreening(name);
    return this.perform(tenantId, userId, "screening", result, clientId, result.riskLevel);
  }

  wallets() {
    return this.prisma.wallet.findMany({ orderBy: { service: "asc" }, select: { service: true, balance: true, tenantId: true } });
  }

  checks(clientId?: string) {
    return this.prisma.verificationCheck.findMany({
      where: clientId ? { clientId } : {},
      orderBy: { createdAt: "desc" },
      select: { id: true, checkType: true, status: true, cost: true, riskLevel: true, clientId: true, tenantId: true, createdAt: true },
    });
  }

  private async perform(tenantId: string, userId: string, service: string, result: Record<string, unknown>, clientId?: string, riskLevel?: string) {
    const cfg = CONFIG[service];
    const provider = await this.prisma.verificationProvider.findFirst({ where: { key: cfg.providerKey } });
    if (!provider) throw new NotFoundException("موفّر التحقّق غير موجود");

    // الفوترة: في نموذج إعادة البيع (Reseller) تُخصم عملية من رصيد المستأجر للخدمة المدفوعة
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId } });
    if (cfg.walletService && cfg.cost > 0 && tenant?.billingModel === "RESELLER") {
      const wallet = await this.prisma.wallet.findFirst({ where: { service: cfg.walletService } });
      if (!wallet || wallet.balance <= 0) {
        throw new HttpException("رصيد عمليات التحقّق غير كافٍ — اشحن المحفظة", HttpStatus.PAYMENT_REQUIRED);
      }
      await this.prisma.$transaction([
        this.prisma.wallet.update({ where: { id: wallet.id }, data: { balance: { decrement: 1 } } }),
        this.prisma.transactionLedger.create({ data: { walletId: wallet.id, delta: -1, reason: `${cfg.providerKey}:${cfg.checkType}` } }),
      ]);
    }

    const check = await this.prisma.verificationCheck.create({
      data: {
        tenantId,
        providerId: provider.id,
        checkType: cfg.checkType,
        status: "success",
        cost: cfg.cost,
        clientId: clientId ?? null,
        riskLevel: riskLevel ?? null,
        resultRef: JSON.stringify(result).slice(0, 240),
      },
      select: { id: true },
    });
    await this.audit.log({ tenantId, userId, action: "verify", entity: "verification_check", entityId: check.id, meta: { provider: cfg.providerKey, type: cfg.checkType } });

    return { checkId: check.id, provider: cfg.providerKey, cost: cfg.cost, riskLevel: riskLevel ?? null, data: result };
  }
}
