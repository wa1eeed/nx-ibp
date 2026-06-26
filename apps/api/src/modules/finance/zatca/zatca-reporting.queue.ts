import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import { RedisService } from "../../../redis/redis.service";
import { ZatcaGateway } from "./zatca.gateway";

const QUEUE_KEY = "zatca:reporting:queue";

/**
 * طابور إبلاغ ZATCA لفواتير B2C (Reporting) — مدعوم بـ Redis (List دائم).
 * الفاتورة تُسلَّم للعميل فوراً، ثم تُبلَّغ للهيئة خلفياً ضمن نافذة 24 ساعة.
 * في الإنتاج يُشغَّل المُصرِّف (drain) كـ BullMQ worker / cron؛ هنا مؤقّت خفيف + استدعاء يدوي.
 */
@Injectable()
export class ZatcaReportingQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ZatcaReportingQueue.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly gateway: ZatcaGateway,
  ) {}

  onModuleInit(): void {
    // مُصرِّف دوري خفيف (لا يُبقي العملية حيّة) — المعالجة الفعلية للإنتاج عبر worker مخصّص.
    this.timer = setInterval(() => void this.drain().catch(() => undefined), 30_000);
    this.timer.unref?.();
  }
  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** إدراج مستند للإبلاغ الخلفي (B2C). */
  async enqueue(documentId: string): Promise<void> {
    await this.redis.client.rpush(QUEUE_KEY, documentId);
  }

  /** تصريف الطابور: إبلاغ كل مستند معلّق وتحديث حالته. يُعيد عدد ما عولج. */
  async drain(limit = 50): Promise<number> {
    let processed = 0;
    for (let i = 0; i < limit; i++) {
      const id = await this.redis.client.lpop(QUEUE_KEY);
      if (!id) break;
      const doc = await this.prisma.billingDocument.findFirst({ where: { id }, select: { id: true, xmlPayload: true, zatcaStatus: true } });
      if (!doc || doc.zatcaStatus === "REPORTED") continue;
      const res = await this.gateway.reportInvoice(doc.xmlPayload);
      if (res.reported) {
        await this.prisma.billingDocument.update({ where: { id }, data: { zatcaStatus: "REPORTED", zatcaReportedAt: new Date() } });
        processed++;
      }
    }
    if (processed) this.logger.log(`أُبلِغ عن ${processed} فاتورة B2C إلى ZATCA (Sandbox)`);
    return processed;
  }

  pendingCount(): Promise<number> {
    return this.redis.client.llen(QUEUE_KEY);
  }
}
