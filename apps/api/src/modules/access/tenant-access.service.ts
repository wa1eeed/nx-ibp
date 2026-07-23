import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export type AccessState = "active" | "trial" | "trial_expired" | "subscription_expired" | "suspended" | "cancelled";

export interface TenantAccess {
  state: AccessState;
  status: string; // Tenant.status الخام
  trialEndsAt: Date | null;
  daysLeft: number | null; // للتجربة السارية (تنبيه العدّاد)
  writeBlocked: boolean; // انتهت التجربة ⇒ قراءة فقط
  downgradeToBasic: boolean; // انتهت التجربة ⇒ ميزات الباقة الأساسية فقط
  hardBlocked: boolean; // SUSPENDED/CANCELLED ⇒ حجب كامل
}

const TTL_MS = 60_000; // كاش قصير في الذاكرة — لا استعلام قاعدة لكل طلب

/**
 * حالة وصول المستأجر الفعّالة — نقطة الحقيقة الوحيدة لفرض انتهاء التجربة/الإيقاف.
 * انتهاء التجربة (`TRIAL` + مضى `trialEndsAt`) ⇒ قراءة فقط + خفض لميزات الأساسية.
 * `SUSPENDED`/`CANCELLED` (إجراء السوبر أدمن) ⇒ حجب كامل. الدفع/الدخول/الفوترة مستثناة دائمًا (يُفرَض في الحارس).
 */
@Injectable()
export class TenantAccessService {
  constructor(private readonly prisma: PrismaService) {}
  private cache = new Map<string, { at: number; val: TenantAccess }>();

  /** أبطِل الكاش بعد أي تغيير للحالة (دفع/تفعيل/تعليق). */
  invalidate(tenantId: string) { this.cache.delete(tenantId); }

  async resolve(tenantId: string): Promise<TenantAccess> {
    const hit = this.cache.get(tenantId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.val;
    const val = await this.compute(tenantId);
    this.cache.set(tenantId, { at: Date.now(), val });
    return val;
  }

  private async compute(tenantId: string): Promise<TenantAccess> {
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId }, select: { status: true } });
    const status = tenant?.status ?? "ACTIVE";
    const base: TenantAccess = { state: "active", status, trialEndsAt: null, daysLeft: null, writeBlocked: false, downgradeToBasic: false, hardBlocked: false };

    if (status === "SUSPENDED") return { ...base, state: "suspended", hardBlocked: true };
    if (status === "CANCELLED") return { ...base, state: "cancelled", hardBlocked: true };

    const sub = await this.prisma.subscription.findFirst({ where: { tenantId }, select: { startedAt: true, renewsAt: true, plan: { select: { trialDays: true } } } });
    const dayMs = 86_400_000;

    if (status === "TRIAL") {
      const trialDays = sub?.plan?.trialDays ?? 0;
      if (sub?.startedAt && trialDays > 0) {
        const end = new Date(sub.startedAt); end.setDate(end.getDate() + trialDays);
        const msLeft = end.getTime() - Date.now();
        if (msLeft <= 0) return { ...base, state: "trial_expired", trialEndsAt: end, daysLeft: 0, writeBlocked: true, downgradeToBasic: true };
        return { ...base, state: "trial", trialEndsAt: end, daysLeft: Math.ceil(msLeft / dayMs) };
      }
      return base; // تجربة بلا مدّة محدّدة
    }

    // مدفوع (ACTIVE): انتهاء الاشتراك عند مرور تاريخ التجديد (renewsAt=null ⇒ بلا فرض، مثل بيانات الديمو)
    if (sub?.renewsAt) {
      const msLeft = sub.renewsAt.getTime() - Date.now();
      if (msLeft <= 0) return { ...base, state: "subscription_expired", trialEndsAt: sub.renewsAt, daysLeft: 0, writeBlocked: true, downgradeToBasic: true };
      if (msLeft <= 7 * dayMs) return { ...base, state: "active", trialEndsAt: sub.renewsAt, daysLeft: Math.ceil(msLeft / dayMs) }; // تنبيه قرب التجديد
    }
    return base;
  }
}
