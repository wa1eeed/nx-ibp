import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { vatTreatmentForClass } from "../../common/tax/vat";

/**
 * كتالوج المنتجات — بيانات مرجعية على مستوى المنصة (غير مفلترة بمستأجر).
 */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /** شجرة الفئات والفروع (لقوائم الاختيار) + نسبة الضريبة لكل فئة (لعرض المعالجة الضريبية). */
  async tree() {
    const classes = await this.prisma.productClass.findMany({
      orderBy: { code: "asc" },
      select: {
        code: true,
        name: true,
        lines: {
          orderBy: { code: "asc" },
          select: { code: true, name: true },
        },
      },
    });
    return classes.map((c) => ({ ...c, vatRate: vatTreatmentForClass(c.code).rate }));
  }

  /**
   * الكتالوج مع **إحصاءات إنتاج المستأجر** لكل فرع (عدد الوثائق/إجمالي القسط) + جاهزية النموذج + المعالجة الضريبية.
   * الكتالوج مرجعي على مستوى المنصّة؛ الإحصاءات مفلترة تلقائيًا بالمستأجر عبر middleware.
   */
  async withStats() {
    const [classes, byLine] = await Promise.all([
      this.prisma.productClass.findMany({
        orderBy: { code: "asc" },
        select: { code: true, name: true, lines: { orderBy: { code: "asc" }, select: { code: true, name: true, formSchema: { select: { version: true } } } } },
      }),
      this.prisma.policy.groupBy({ by: ["productLineCode"], where: { status: "ISSUED" }, _sum: { totalPremium: true }, _count: true }),
    ]);
    const stats = new Map(byLine.map((l) => [l.productLineCode, { count: l._count, premium: Number(l._sum.totalPremium ?? 0) }]));
    return classes.map((c) => ({
      code: c.code,
      name: c.name,
      vatRate: vatTreatmentForClass(c.code).rate,
      lines: c.lines.map((l) => ({ code: l.code, name: l.name, hasForm: !!l.formSchema, ...(stats.get(l.code) ?? { count: 0, premium: 0 }) })),
    }));
  }

  /** فرع واحد مع مخطط نموذجه (لعرض النموذج الديناميكي). */
  async line(code: string) {
    const line = await this.prisma.productLine.findFirst({
      where: { code },
      select: {
        code: true,
        name: true,
        class: { select: { code: true, name: true } },
        formSchema: { select: { version: true, baseFields: true, blocks: true } },
      },
    });
    if (!line) throw new NotFoundException("فرع المنتج غير موجود");
    return line;
  }
}
