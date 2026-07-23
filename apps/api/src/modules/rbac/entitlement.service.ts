import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantAccessService } from "../access/tenant-access.service";

const BASIC_CODE = "basic"; // الباقة الأساسية = الأرضية عند انتهاء التجربة

/**
 * محرّك الـ entitlements: هل ميزة/موديول مفعّل في باقة المستأجر؟
 * مفعّل إذا كان وضعه INCLUDED/QUOTA/METERED، أو اشتُري كـ add-on. DISABLED/غير موجود ⇒ مقفل.
 * **عند انتهاء التجربة**: تُخفَّض الميزات لباقة «basic» (المتقدّمة تُقفل)؛ وعند الإيقاف ⇒ كل شيء مقفل.
 */
@Injectable()
export class EntitlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TenantAccessService,
  ) {}
  private basicKeys: Set<string> | null = null;

  async isFeatureEnabled(tenantId: string, featureKey: string): Promise<boolean> {
    const acc = await this.access.resolve(tenantId);
    if (acc.hardBlocked) return false; // موقوف/مُلغى ⇒ لا شيء (دفاع بالعمق مع الحارس)

    const sub = await this.prisma.subscription.findFirst({
      where: { tenantId },
      include: { plan: { include: { entitlements: true } }, addons: true },
    });
    if (!sub) return false;

    const bySub = sub.addons.some((a) => a.addonKey === featureKey) || (() => {
      const ent = sub.plan.entitlements.find((e) => e.featureKey === featureKey);
      return !!ent && (ent.mode === "INCLUDED" || ent.mode === "QUOTA" || ent.mode === "METERED");
    })();
    if (!bySub) return false;

    // انتهاء التجربة: يبقى فقط ما هو مشمول في الباقة الأساسية
    if (acc.downgradeToBasic) return await this.basicIncludes(featureKey);
    return true;
  }

  /** هل الميزة مشمولة في الباقة الأساسية؟ (مُخزَّنة مؤقتًا — الأرضية عند الخفض) */
  private async basicIncludes(featureKey: string): Promise<boolean> {
    if (!this.basicKeys) {
      const basic = await this.prisma.plan.findUnique({ where: { code: BASIC_CODE }, include: { entitlements: true } });
      this.basicKeys = new Set((basic?.entitlements ?? []).filter((e) => e.mode === "INCLUDED" || e.mode === "QUOTA" || e.mode === "METERED").map((e) => e.featureKey));
    }
    return this.basicKeys.has(featureKey);
  }

  /** القيمة العددية لميزة (مثل حد الرفع upload.maxFileMb) — null إن لم تُحدَّد. */
  async getNumericValue(tenantId: string, featureKey: string): Promise<number | null> {
    const sub = await this.prisma.subscription.findFirst({
      where: { tenantId },
      include: { plan: { include: { entitlements: true } } },
    });
    const ent = sub?.plan.entitlements.find((e) => e.featureKey === featureKey);
    return ent?.numericValue != null ? Number(ent.numericValue) : null;
  }

  /** خريطة كاملة لـ entitlements المستأجر (للواجهات/التقارير لاحقاً). */
  async getEffective(tenantId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { tenantId },
      include: { plan: { include: { entitlements: true } }, addons: true },
    });
    if (!sub) return [];
    const purchased = new Set(sub.addons.map((a) => a.addonKey));
    return sub.plan.entitlements.map((e) => ({
      featureKey: e.featureKey,
      mode: e.mode,
      quota: e.quota,
      numericValue: e.numericValue,
      enabled:
        purchased.has(e.featureKey) ||
        e.mode === "INCLUDED" ||
        e.mode === "QUOTA" ||
        e.mode === "METERED",
    }));
  }
}
