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
    const [classes, policies, claims] = await Promise.all([
      this.prisma.productClass.findMany({
        orderBy: { code: "asc" },
        select: { code: true, name: true, lines: { orderBy: { code: "asc" }, select: { code: true, name: true, formSchema: { select: { version: true } } } } },
      }),
      // الإحصاء مفلتر تلقائيًا بالمستأجر عبر middleware — نجمع بمرور واحد لكل فرع
      this.prisma.policy.findMany({ where: { status: "ISSUED" }, select: { id: true, productLineCode: true, clientId: true, totalPremium: true, commissionAmount: true } }),
      this.prisma.claim.findMany({ select: { policyId: true, claimedAmount: true } }),
    ]);
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const lineOfPolicy = new Map<string, string>();
    const agg = new Map<string, { count: number; premium: number; commission: number; clients: Set<string> }>();
    for (const p of policies) {
      const code = p.productLineCode; if (!code) continue;
      lineOfPolicy.set(p.id, code);
      const a = agg.get(code) ?? { count: 0, premium: 0, commission: 0, clients: new Set<string>() };
      a.count += 1; a.premium += Number(p.totalPremium ?? 0); a.commission += Number(p.commissionAmount ?? 0);
      if (p.clientId) a.clients.add(p.clientId);
      agg.set(code, a);
    }
    const claimsByLine = new Map<string, number>(); // مطالبات الفرع عبر ربط الوثيقة (نسبة الخسارة)
    for (const c of claims) {
      const code = c.policyId ? lineOfPolicy.get(c.policyId) : undefined; if (!code) continue;
      claimsByLine.set(code, (claimsByLine.get(code) ?? 0) + Number(c.claimedAmount ?? 0));
    }
    return classes.map((c) => ({
      code: c.code,
      name: c.name,
      vatRate: vatTreatmentForClass(c.code).rate,
      lines: c.lines.map((l) => {
        const a = agg.get(l.code);
        return {
          code: l.code, name: l.name, hasForm: !!l.formSchema,
          count: a?.count ?? 0,
          premium: r2(a?.premium ?? 0), // إجمالي الأقساط (GWP)
          commission: r2(a?.commission ?? 0), // العمولة المكتسبة
          clients: a?.clients.size ?? 0, // عملاء فريدون
          claims: r2(claimsByLine.get(l.code) ?? 0), // إجمالي المطالبات (لنسبة الخسارة)
        };
      }),
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
