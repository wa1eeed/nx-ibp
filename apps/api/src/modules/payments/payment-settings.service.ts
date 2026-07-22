import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CryptoVaultService } from "../../common/crypto/crypto-vault.service";
import { AuditService } from "../../common/audit/audit.service";

/** بوّابات الدفع المدعومة للمستأجر (يفعّل واحدة). */
export const PAYMENT_PROVIDERS = ["none", "tap", "moyasar"] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export interface PaymentSettingsView {
  provider: PaymentProvider;
  enabled: boolean;
  currency: string;
  publicKey: string | null;
  secretKeyMasked: string | null;
  hasSecret: boolean;
  mode: "test" | "live" | null; // مُشتقّ من بادئة المفتاح (pk_test_/pk_live_)
}

/** وضع البوّابة من بادئة المفتاح (Tap/Moyasar: pk_/sk_ + test/live). */
export const keyMode = (key: string | null | undefined): "test" | "live" | null =>
  !key ? null : /_live_/.test(key) ? "live" : /_test_/.test(key) ? "test" : null;

/**
 * إعدادات بوّابة الدفع للمستأجر (BYO) — يستقبل الوسيط مدفوعات عملائه عبر بوّابة واحدة
 * بمفاتيحه الخاصة. المفتاح السرّي **مشفّر at-rest** (AES-256-GCM عبر CryptoVaultService)
 * ولا يُعاد **أبداً** بنصّه الصريح للواجهة (masked فقط).
 */
@Injectable()
export class PaymentSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: CryptoVaultService,
    private readonly audit: AuditService,
  ) {}

  private row(tenantId: string) {
    return this.prisma.tenantPaymentSettings.findUnique({ where: { tenantId } });
  }

  /** إعدادات الدفع للعرض — بلا مفتاح سرّي خام. */
  async get(tenantId: string): Promise<PaymentSettingsView> {
    const r = await this.row(tenantId);
    return {
      provider: ((r?.provider ?? "none") as PaymentProvider),
      enabled: r?.enabled ?? false,
      currency: r?.currency ?? "SAR",
      publicKey: r?.publicKey ?? null,
      secretKeyMasked: this.vault.mask(r?.secretKeyEncrypted ?? null),
      hasSecret: !!r?.secretKeyEncrypted,
      mode: keyMode(r?.publicKey),
    };
  }

  /**
   * حفظ إعدادات الدفع: يختار البوّابة، يخزّن المفتاح العام، ويشفّر المفتاح السرّي.
   * المفتاح السرّي الفارغ يُبقي المخزَّن (لا يُمحى بالتحديث)؛ لا يمكن التفعيل بلا مفتاح سرّي.
   */
  async save(
    tenantId: string,
    userId: string,
    dto: { provider: string; publicKey?: string; secretKey?: string; enabled?: boolean; currency?: string },
  ): Promise<PaymentSettingsView> {
    const provider = (dto.provider ?? "none").trim() as PaymentProvider;
    if (!(PAYMENT_PROVIDERS as readonly string[]).includes(provider)) throw new BadRequestException("بوّابة دفع غير مدعومة");
    const existing = await this.row(tenantId);

    // المفتاح السرّي: الجديد يُشفَّر؛ الفارغ يُبقي القائم
    const secretKeyEncrypted = dto.secretKey?.trim()
      ? this.vault.encrypt(dto.secretKey.trim())
      : (existing?.secretKeyEncrypted ?? null);
    const publicKey = dto.publicKey?.trim() ?? existing?.publicKey ?? null;
    const currency = (dto.currency?.trim() || existing?.currency || "SAR").toUpperCase();

    // تحقّق من صيغة المفاتيح وتطابق الوضع (اختبار/حيّ) لبوّابة فعلية
    if (provider !== "none") {
      if (publicKey && !/^pk_(test|live)_/.test(publicKey)) throw new BadRequestException("المفتاح العام يجب أن يبدأ بـ pk_test_ أو pk_live_");
      const effectiveSecret = dto.secretKey?.trim() || (existing?.secretKeyEncrypted ? this.vault.decrypt(existing.secretKeyEncrypted) : "");
      if (effectiveSecret && !/^sk_(test|live)_/.test(effectiveSecret)) throw new BadRequestException("المفتاح السرّي يجب أن يبدأ بـ sk_test_ أو sk_live_");
      const pub = keyMode(publicKey), sec = keyMode(effectiveSecret || null);
      if (pub && sec && pub !== sec) throw new BadRequestException("المفتاح العام والسرّي يجب أن يكونا من نفس الوضع (اختبار أو حيّ) — لا تخلط بينهما");
    }

    // لا تفعيل بلا بوّابة فعلية ومفتاح سرّي
    const wantEnabled = dto.enabled ?? existing?.enabled ?? false;
    const enabled = wantEnabled && provider !== "none" && !!secretKeyEncrypted;
    if (wantEnabled && (provider === "none" || !secretKeyEncrypted)) {
      throw new BadRequestException("لا يمكن تفعيل الدفع بلا بوّابة ومفتاح سرّي");
    }

    await this.prisma.tenantPaymentSettings.upsert({
      where: { tenantId },
      update: { provider, secretKeyEncrypted, publicKey, currency, enabled },
      create: { tenantId, provider, secretKeyEncrypted, publicKey, currency, enabled },
    });
    await this.audit.log({ tenantId, userId, action: "update", entity: "payment_settings", entityId: tenantId, meta: { provider, enabled } });
    return this.get(tenantId);
  }

  /** المفتاح السرّي الخام (لاستخدام الخادم فقط — إنشاء عملية دفع). null إن غير مُهيّأ/مُفعّل. */
  async activeGateway(tenantId: string): Promise<{ provider: PaymentProvider; secretKey: string; publicKey: string | null; currency: string } | null> {
    const r = await this.row(tenantId);
    if (!r?.enabled || r.provider === "none" || !r.secretKeyEncrypted) return null;
    return { provider: r.provider as PaymentProvider, secretKey: this.vault.decrypt(r.secretKeyEncrypted), publicKey: r.publicKey, currency: r.currency };
  }
}
