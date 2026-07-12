import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * نطاق المنتجات (صلاحيات على مستوى فرع التأمين) — بند H.
 * **متوافق رجعيًا**: قائمة `allowedProductLines` فارغة ⇒ بلا تقييد (كل الفروع)،
 * فلا يتأثّر أي مستخدم/اختبار قائم. التقييد يعمل فقط لمن خُصِّص له فروع محدّدة.
 */
@Injectable()
export class ProductScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /** أكواد الفروع المسموحة للمستخدم (فارغة = بلا تقييد). */
  async linesFor(userId: string): Promise<string[]> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { allowedProductLines: true } });
    return u?.allowedProductLines ?? [];
  }

  /**
   * شرط Prisma لتصفية القوائم بحسب نطاق المستخدم على حقل كود الفرع.
   * يُرجِع `{}` (بلا شرط) للمستخدم غير المقيَّد — لذا يمكن دمجه دائمًا بأمان.
   */
  async whereFor(userId: string, field = "productLineCode"): Promise<Record<string, unknown>> {
    const lines = await this.linesFor(userId);
    return lines.length ? { [field]: { in: lines } } : {};
  }

  /** هل يُسمح للمستخدم بهذا الفرع؟ (غير مقيَّد ⇒ نعم دائمًا). */
  async allows(userId: string, lineCode: string | null | undefined): Promise<boolean> {
    const lines = await this.linesFor(userId);
    return lines.length === 0 || (lineCode != null && lines.includes(lineCode));
  }

  /** يفرض السماح أو يرمي 403 (للاستخدام في مسارات الإنشاء/الوصول). */
  async assertAllowed(userId: string, lineCode: string | null | undefined): Promise<void> {
    if (!(await this.allows(userId, lineCode))) {
      throw new ForbiddenException("فرع التأمين خارج نطاق صلاحياتك على المنتجات");
    }
  }
}
