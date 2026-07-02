import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { EntitlementService } from "../rbac/entitlement.service";

const DEFAULT_QUOTA_MB = 1024; // احتياطي إن لم تُحدَّد الحصّة في الباقة

/**
 * حصص التخزين لكل مستأجر (المرحلة D1). الحدّ من entitlement `storage.quotaMb`.
 * **الحجز ذرّي**: زيادة `usedBytes` عبر UPDATE واحد بحارس WHERE يمنع التجاوز
 * حتى تحت التزامن (لا سباق check-then-write). التلميتري عبر `usage()`.
 */
@Injectable()
export class StorageUsageService {
  private readonly logger = new Logger(StorageUsageService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
  ) {}

  async quotaBytes(tenantId: string): Promise<bigint> {
    const mb = (await this.entitlements.getNumericValue(tenantId, "storage.quotaMb")) ?? DEFAULT_QUOTA_MB;
    return BigInt(Math.round(mb)) * 1024n * 1024n;
  }

  /** يضمن صفّ العدّاد؛ عند أوّل إنشاء يعبّئه من مجموع المستندات الحالية (baseline). */
  async ensure(tenantId: string): Promise<void> {
    const existing = await this.prisma.tenantStorage.findFirst({ where: { tenantId }, select: { tenantId: true } });
    if (existing) return;
    const agg = await this.prisma.document.aggregate({ where: { tenantId }, _sum: { sizeBytes: true }, _count: true });
    await this.prisma.tenantStorage
      .create({ data: { tenantId, usedBytes: BigInt(agg._sum.sizeBytes ?? 0), fileCount: agg._count } })
      .catch(() => undefined); // سباق الإنشاء الأوّل — التضارب مقبول
  }

  /** حجز ذرّي: يفشل بـ 403 إن تجاوز الحصّة. */
  async reserve(tenantId: string, bytes: number): Promise<void> {
    await this.ensure(tenantId);
    const quota = await this.quotaBytes(tenantId);
    const size = BigInt(Math.max(0, Math.round(bytes)));
    const res = await this.prisma.tenantStorage.updateMany({
      where: { tenantId, usedBytes: { lte: quota - size } },
      data: { usedBytes: { increment: size }, fileCount: { increment: 1 } },
    });
    if (res.count === 0) {
      throw new ForbiddenException(`تجاوزت حصّة التخزين لباقتك (${Number(quota / 1024n / 1024n)}MB)`);
    }
  }

  /** مطابقة الحجم الفعلي بعد الرفع (delta قد يكون سالباً). بلا سياق ⇒ tenantId صريح. */
  async reconcile(tenantId: string, deltaBytes: number): Promise<void> {
    if (!deltaBytes) return;
    await this.prisma.tenantStorage.updateMany({
      where: { tenantId },
      data: { usedBytes: { increment: BigInt(Math.round(deltaBytes)) } },
    });
  }

  /** تحرير حجز عند فشل الإنشاء. */
  async release(tenantId: string, bytes: number): Promise<void> {
    await this.prisma.tenantStorage.updateMany({
      where: { tenantId },
      data: { usedBytes: { decrement: BigInt(Math.max(0, Math.round(bytes))) }, fileCount: { decrement: 1 } },
    });
  }

  /** تلميتري الاستهلاك للمستأجر. */
  async usage(tenantId: string) {
    await this.ensure(tenantId);
    const row = await this.prisma.tenantStorage.findFirst({ where: { tenantId }, select: { usedBytes: true, fileCount: true } });
    const quota = await this.quotaBytes(tenantId);
    const used = Number(row?.usedBytes ?? 0n);
    const quotaNum = Number(quota);
    return {
      usedBytes: used,
      fileCount: row?.fileCount ?? 0,
      quotaBytes: quotaNum,
      quotaMb: Number(quota / 1024n / 1024n),
      percentUsed: quotaNum > 0 ? Math.round((used / quotaNum) * 1000) / 10 : 0,
    };
  }
}
