import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * كتالوج المنتجات — بيانات مرجعية على مستوى المنصة (غير مفلترة بمستأجر).
 */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /** شجرة الفئات والفروع (لقوائم الاختيار). */
  tree() {
    return this.prisma.productClass.findMany({
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
