import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * مولّد أرقام تسلسلية مبدئي (لكل مستأجر — العدّ مفلتر تلقائياً).
 * يكتمل في المرحلة 4 بجدول تسلسلات وفروع وفئات (POL-RUH-MED-2026-1001).
 */
@Injectable()
export class SequenceService {
  constructor(private readonly prisma: PrismaService) {}

  private year(): number {
    return new Date().getFullYear();
  }

  /** كود عميل تجاري مقروء: CLI-2026-1001 */
  async nextClientCode(): Promise<string> {
    const count = await this.prisma.client.count();
    return `CLI-${this.year()}-${1001 + count}`;
  }

  /** رقم طلب: SL-MED-2026-1001 (فئة المنتج + السنة + تسلسل) */
  async nextRequestSeq(classCode: string): Promise<string> {
    const count = await this.prisma.policyRequest.count();
    return `SL-${classCode}-${this.year()}-${1001 + count}`;
  }

  /** رقم طلب أسعار: RFQ-MED-2026-1001 */
  async nextSlipSeq(classCode: string): Promise<string> {
    const count = await this.prisma.slip.count();
    return `RFQ-${classCode}-${this.year()}-${1001 + count}`;
  }
}
