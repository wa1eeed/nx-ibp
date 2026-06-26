import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import { ZatcaGateway } from "./zatca.gateway";
import { ZatcaReportingQueue } from "./zatca-reporting.queue";

/**
 * موجِّه إرسال الفواتير إلى ZATCA حسب نوع المعاملة (يُستدعى **بعد** تثبيت المعاملة):
 * - B2B (STANDARD): مقاصة فورية (Clearance) — ننتظر ختم الهيئة قبل اعتماد المستند للتسليم.
 * - B2C (SIMPLIFIED): توليد محلي فوري + إبلاغ خلفي (Reporting) خلال 24 ساعة عبر الطابور.
 */
@Injectable()
export class ZatcaInvoiceRouter {
  private readonly logger = new Logger(ZatcaInvoiceRouter.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ZatcaGateway,
    private readonly queue: ZatcaReportingQueue,
  ) {}

  /** يوجّه مستند فوترة منشأ حديثاً. آمن للاستدعاء بعد commit المعاملة المالية. */
  async route(documentId: string): Promise<{ flow: string; status: string }> {
    const doc = await this.prisma.billingDocument.findFirst({
      where: { id: documentId },
      select: { id: true, invoiceSubtype: true, xmlPayload: true },
    });
    if (!doc) return { flow: "NONE", status: "NOT_FOUND" };

    if (doc.invoiceSubtype === "SIMPLIFIED_B2C") {
      // المسار B: تسليم فوري + إبلاغ خلفي
      await this.queue.enqueue(doc.id);
      return { flow: "REPORTING", status: "QUEUED" };
    }

    // المسار A: مقاصة فورية — لا يُسلَّم المستند قبل ختم الهيئة
    const res = await this.gateway.clearInvoice(doc.xmlPayload);
    await this.prisma.billingDocument.update({
      where: { id: doc.id },
      data: { zatcaStatus: res.cleared ? "CLEARED" : "FAILED", zatcaStampB64: res.stamp },
    });
    return { flow: "CLEARANCE", status: res.cleared ? "CLEARED" : "FAILED" };
  }
}
