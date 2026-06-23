import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * نقطة قراءة مصغّرة للمطالبات — غرضها في المرحلة 2 إثبات بوابة الـ entitlement.
 * تُوسَّع في المرحلة 6. معزولة تلقائياً بالمستأجر.
 */
@Injectable()
export class ClaimsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.claim.findMany({
      select: { id: true, sequenceNo: true, tenantId: true },
    });
  }
}
