import { HttpException, HttpStatus, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { VERIFICATION_GATEWAY, type VerificationGateway } from "./verification.gateway";

/**
 * طبقة موفّري التحقّق (المرحلة 7) — تعمل عبر Sandbox تجريبي أولاً (GUIDELINES.md/BLUEPRINT).
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

/** حدّ التنبيه لرصيد محفظة التحقّق (عمليات متبقّية). */
const WALLET_LOW_THRESHOLD = 10;

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    @Inject(VERIFICATION_GATEWAY) private readonly gateway: VerificationGateway,
  ) {}

  // ----- جلب البيانات عبر البوّابة (Sandbox افتراضيًا · موفّرون فعليون عند VERIFY_GATEWAY=live) -----
  async yaqeen(tenantId: string, userId: string, nationalId: string, clientId?: string) {
    return this.perform(tenantId, userId, "yaqeen", await this.gateway.identity(nationalId), clientId);
  }
  async wathiq(tenantId: string, userId: string, crNumber: string, clientId?: string) {
    return this.perform(tenantId, userId, "wathiq", await this.gateway.commercialRegistration(crNumber), clientId);
  }
  async address(tenantId: string, userId: string, id: string, clientId?: string) {
    return this.perform(tenantId, userId, "address", await this.gateway.address(id), clientId);
  }
  async screening(tenantId: string, userId: string, name: string, clientId?: string) {
    const result = await this.gateway.screening(name);
    return this.perform(tenantId, userId, "screening", result as unknown as Record<string, unknown>, clientId, result.riskLevel);
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
      // تنبيه المالية عند انخفاض رصيد محفظة التحقّق تحت الحدّ
      const remaining = wallet.balance - 1;
      if (remaining <= WALLET_LOW_THRESHOLD) {
        void this.notifications.notifyStaff(tenantId, "staff_wallet_low", { balance: String(remaining) }).catch(() => undefined);
      }
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
    // إشعار الامتثال بنتيجة عملية تحقّق
    void this.notifications.notifyStaff(tenantId, "staff_verification_result", { subject: cfg.checkType, result: riskLevel ?? "success" }).catch(() => undefined);

    return { checkId: check.id, provider: cfg.providerKey, cost: cfg.cost, riskLevel: riskLevel ?? null, data: result };
  }
}
