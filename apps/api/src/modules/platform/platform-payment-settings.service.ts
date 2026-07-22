import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CryptoVaultService } from "../../common/crypto/crypto-vault.service";
import { AuditService } from "../../common/audit/audit.service";

export interface PlatformPaymentView {
  provider: string;
  mode: "test" | "live";
  enabled: boolean;
  merchantId: string | null;
  testPublicKey: string | null;
  hasTestSecret: boolean;
  livePublicKey: string | null;
  hasLiveSecret: boolean;
}

const ID = "singleton";

/**
 * بوّابة دفع المنصّة (Tap) لفوترة اشتراكات الوسطاء — يديرها السوبر أدمن.
 * يُخزَّن مفتاحا الاختبار والحيّ معًا (السرّي مشفّر at-rest)، و`mode` يحدّد الفعّال —
 * فالتبديل test⇄live مجرّد تغيير الوضع بلا إعادة إدخال. السرّي لا يُعاد خامًا أبداً.
 */
@Injectable()
export class PlatformPaymentSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: CryptoVaultService,
    private readonly audit: AuditService,
  ) {}

  private row() {
    return this.prisma.platformPaymentSettings.findUnique({ where: { id: ID } });
  }

  async get(): Promise<PlatformPaymentView> {
    const r = await this.row();
    return {
      provider: r?.provider ?? "tap",
      mode: ((r?.mode as "test" | "live") ?? "test"),
      enabled: r?.enabled ?? false,
      merchantId: r?.merchantId ?? null,
      testPublicKey: r?.testPublicKey ?? null,
      hasTestSecret: !!r?.testSecretKeyEncrypted,
      livePublicKey: r?.livePublicKey ?? null,
      hasLiveSecret: !!r?.liveSecretKeyEncrypted,
    };
  }

  async save(
    adminId: string,
    dto: { mode?: string; enabled?: boolean; merchantId?: string; testPublicKey?: string; testSecretKey?: string; livePublicKey?: string; liveSecretKey?: string },
  ): Promise<PlatformPaymentView> {
    const existing = await this.row();
    const mode = (dto.mode === "live" ? "live" : dto.mode === "test" ? "test" : (existing?.mode as "test" | "live") ?? "test");

    // تحقّق من صيغة المفاتيح حسب الوضع
    const t = (k?: string) => k?.trim();
    if (t(dto.testPublicKey) && !/^pk_test_/.test(t(dto.testPublicKey)!)) throw new BadRequestException("مفتاح الاختبار العام يجب أن يبدأ بـ pk_test_");
    if (t(dto.testSecretKey) && !/^sk_test_/.test(t(dto.testSecretKey)!)) throw new BadRequestException("مفتاح الاختبار السرّي يجب أن يبدأ بـ sk_test_");
    if (t(dto.livePublicKey) && !/^pk_live_/.test(t(dto.livePublicKey)!)) throw new BadRequestException("المفتاح العام الحيّ يجب أن يبدأ بـ pk_live_");
    if (t(dto.liveSecretKey) && !/^sk_live_/.test(t(dto.liveSecretKey)!)) throw new BadRequestException("المفتاح السرّي الحيّ يجب أن يبدأ بـ sk_live_");

    const testPublicKey = t(dto.testPublicKey) ?? existing?.testPublicKey ?? null;
    const livePublicKey = t(dto.livePublicKey) ?? existing?.livePublicKey ?? null;
    const testSecretKeyEncrypted = t(dto.testSecretKey) ? this.vault.encrypt(t(dto.testSecretKey)!) : existing?.testSecretKeyEncrypted ?? null;
    const liveSecretKeyEncrypted = t(dto.liveSecretKey) ? this.vault.encrypt(t(dto.liveSecretKey)!) : existing?.liveSecretKeyEncrypted ?? null;

    // لا تفعيل لوضع بلا مفتاحيه (عام + سرّي)
    const wantEnabled = dto.enabled ?? existing?.enabled ?? false;
    const activeSecret = mode === "live" ? liveSecretKeyEncrypted : testSecretKeyEncrypted;
    const activePub = mode === "live" ? livePublicKey : testPublicKey;
    if (wantEnabled && (!activeSecret || !activePub)) {
      throw new BadRequestException(`لا يمكن التفعيل: أكمِل مفتاحَي وضع «${mode === "live" ? "الحيّ" : "الاختبار"}» أولاً`);
    }

    await this.prisma.platformPaymentSettings.upsert({
      where: { id: ID },
      update: { provider: "tap", mode, enabled: wantEnabled, merchantId: t(dto.merchantId) ?? existing?.merchantId ?? null, testPublicKey, testSecretKeyEncrypted, livePublicKey, liveSecretKeyEncrypted },
      create: { id: ID, provider: "tap", mode, enabled: wantEnabled, merchantId: t(dto.merchantId) ?? null, testPublicKey, testSecretKeyEncrypted, livePublicKey, liveSecretKeyEncrypted },
    });
    await this.audit.log({ tenantId: "platform", userId: adminId, action: "update", entity: "platform_payment", entityId: ID, meta: { mode, enabled: wantEnabled } });
    return this.get();
  }

  /** المفتاح السرّي الفعّال حسب الوضع — للخادم فقط (فوترة الاشتراكات). null إن غير مُهيّأ/مُفعّل. */
  async activeSecret(): Promise<{ secretKey: string; publicKey: string | null; mode: "test" | "live" } | null> {
    const r = await this.row();
    if (!r?.enabled) return null;
    const enc = r.mode === "live" ? r.liveSecretKeyEncrypted : r.testSecretKeyEncrypted;
    if (!enc) return null;
    return { secretKey: this.vault.decrypt(enc), publicKey: r.mode === "live" ? r.livePublicKey : r.testPublicKey, mode: r.mode as "test" | "live" };
  }
}
