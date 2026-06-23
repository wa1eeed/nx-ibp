import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * محرّك الـ entitlements: هل ميزة/موديول مفعّل في باقة المستأجر؟
 * مفعّل إذا كان وضعه INCLUDED/QUOTA/METERED، أو وضعه ADDON واشتُري كـ add-on،
 * أو اشتُري كـ add-on صراحةً. DISABLED أو غير موجود ⇒ مقفل.
 */
@Injectable()
export class EntitlementService {
  constructor(private readonly prisma: PrismaService) {}

  async isFeatureEnabled(tenantId: string, featureKey: string): Promise<boolean> {
    const sub = await this.prisma.subscription.findFirst({
      where: { tenantId },
      include: { plan: { include: { entitlements: true } }, addons: true },
    });
    if (!sub) return false;

    if (sub.addons.some((a) => a.addonKey === featureKey)) return true;

    const ent = sub.plan.entitlements.find((e) => e.featureKey === featureKey);
    if (!ent) return false;
    return ent.mode === "INCLUDED" || ent.mode === "QUOTA" || ent.mode === "METERED";
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
