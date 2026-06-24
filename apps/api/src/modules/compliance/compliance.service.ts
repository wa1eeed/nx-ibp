import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * لوحة الالتزام (المرحلة 9) — تجميعات معزولة بالمستأجر تلقائياً.
 * تعرض حالة امتثال العملاء، توزيع مخاطر فحص PEP/العقوبات، وعمليات التحقّق الأخيرة.
 */
@Injectable()
export class ComplianceService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const [clientsByStatus, checksByRisk, checksByType, recent, totalChecks] = await Promise.all([
      this.prisma.client.groupBy({ by: ["complianceStatus"], _count: true }),
      this.prisma.verificationCheck.groupBy({ by: ["riskLevel"], where: { riskLevel: { not: null } }, _count: true }),
      this.prisma.verificationCheck.groupBy({ by: ["checkType"], _count: true }),
      this.prisma.verificationCheck.findMany({ orderBy: { createdAt: "desc" }, take: 8, select: { id: true, checkType: true, status: true, riskLevel: true, clientId: true, createdAt: true } }),
      this.prisma.verificationCheck.count(),
    ]);

    const clientIds = [...new Set(recent.map((r) => r.clientId).filter((x): x is string => !!x))];
    const clients = clientIds.length ? await this.prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } }) : [];
    const nameOf = Object.fromEntries(clients.map((c) => [c.id, c.name]));

    return {
      clientsByStatus: clientsByStatus.map((c) => ({ status: c.complianceStatus, count: c._count })),
      riskDistribution: checksByRisk.map((r) => ({ level: r.riskLevel ?? "—", count: r._count })),
      checksByType: checksByType.map((c) => ({ type: c.checkType, count: c._count })),
      recentChecks: recent.map((r) => ({ ...r, clientName: nameOf[r.clientId ?? ""] ?? "—" })),
      totalChecks,
    };
  }
}
