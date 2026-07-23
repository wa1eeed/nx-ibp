import { Injectable } from "@nestjs/common";
import { Prisma } from "@ibp/db";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * سجلّ السجلات التجارية المرجعي — مبنيّ على «البيانات المفتوحة» لوزارة التجارة (لقطة فصلية للسجلات القائمة).
 * يتيح **تحققًا فوريًّا برقم السجل** بلا نداء خارجي (بحث محليّ)، ويُستورَد دوريًّا من ملفّ الداتاست.
 * الداتاست المرجعي: open.data.gov.sa/ar/datasets/view/aef772cd-354c-48bb-9819-c60706dc8b56
 */
export interface CrRecord {
  crNumber: string;
  unifiedNumber: string | null;
  name: string;
  activity: string | null;
  legalEntity: string | null;
  issueDate: string | null; // ISO date
  region: string | null;
  city: string | null;
  capital: string | null;
  registryType: string | null;
  status: string;
  source: string;
}

/** أرقام السجلات في الداتاست عربية/إنجليزية — نُطبّعها لأرقام لاتينية فقط. */
export function normalizeCrNumber(input: string): string {
  const ar = "٠١٢٣٤٥٦٧٨٩";
  return (input || "")
    .replace(/[٠-٩]/g, (d) => String(ar.indexOf(d)))
    .replace(/\D/g, "");
}

@Injectable()
export class CrRegistryService {
  constructor(private readonly prisma: PrismaService) {}

  /** بحث فوريّ برقم السجل — يُعيد السجل نظيفًا أو null. */
  async lookup(crNumber: string): Promise<CrRecord | null> {
    const cr = normalizeCrNumber(crNumber);
    if (!cr) return null;
    const r = await this.prisma.crRegistryRecord.findUnique({ where: { crNumber: cr } });
    if (!r) return null;
    return {
      crNumber: r.crNumber,
      unifiedNumber: r.unifiedNumber,
      name: r.name,
      activity: r.activity,
      legalEntity: r.legalEntity,
      issueDate: r.issueDate ? r.issueDate.toISOString().slice(0, 10) : null,
      region: r.region,
      city: r.city,
      capital: r.capital ? r.capital.toString() : null,
      registryType: r.registryType,
      status: r.status,
      source: r.source,
    };
  }

  /** وصف اللقطة الحالية (للعرض): عدد السجلات + المصدر. */
  async meta(): Promise<{ count: number; source: string | null }> {
    const [count, latest] = await Promise.all([
      this.prisma.crRegistryRecord.count(),
      this.prisma.crRegistryRecord.findFirst({ orderBy: { importedAt: "desc" }, select: { source: true } }),
    ]);
    return { count, source: latest?.source ?? null };
  }

  /**
   * استيراد دفعة من صفوف الداتاست (upsert برقم السجل). يقبل مفاتيح الأعمدة العربية للداتاست
   * أو مرادفاتها الإنجليزية، فيصلح للاستيراد المباشر من ملفّ البيانات المفتوحة.
   * يُعيد عدد المستوردة.
   */
  async importRows(rows: Array<Record<string, unknown>>, source = "opendata_mc_2026q1"): Promise<{ imported: number }> {
    const pick = (row: Record<string, unknown>, keys: string[]): string | null => {
      for (const k of keys) { const v = row[k]; if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim(); }
      return null;
    };
    let imported = 0;
    for (const row of rows) {
      const crRaw = pick(row, ["رقم السجل", "crNumber", "cr", "registrationNumber"]);
      const cr = crRaw ? normalizeCrNumber(crRaw) : null;
      const name = pick(row, ["اسم السجل", "name", "companyName"]);
      if (!cr || !name) continue;
      const capitalRaw = pick(row, ["رأس المال", "capital"]);
      const capital = capitalRaw ? Number(capitalRaw.replace(/[^\d.]/g, "")) : null;
      const issueRaw = pick(row, ["تاريخ انشاء السجل", "تاريخ إنشاء السجل", "issueDate"]);
      const issueDate = issueRaw ? new Date(issueRaw) : null;
      const data = {
        name,
        unifiedNumber: pick(row, ["الرقم الموحد", "الرقم الموحّد", "unifiedNumber"]),
        activity: pick(row, ["نوع النشاط التجاري (بالعربية)", "نوع النشاط التجاري", "activity"]),
        legalEntity: pick(row, ["الكيان القانوني", "legalEntity"]),
        issueDate: issueDate && !isNaN(issueDate.getTime()) ? issueDate : null,
        region: pick(row, ["المنطقة", "region"]),
        city: pick(row, ["المدينة", "city"]),
        capital: capital !== null && !isNaN(capital) ? new Prisma.Decimal(capital) : null,
        registryType: pick(row, ["نوع السجل", "registryType"]),
        status: "active",
        source,
        importedAt: new Date(),
      };
      await this.prisma.crRegistryRecord.upsert({ where: { crNumber: cr }, update: data, create: { crNumber: cr, ...data } });
      imported++;
    }
    return { imported };
  }
}
