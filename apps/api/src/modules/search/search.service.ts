import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { PermissionService } from "../rbac/permission.service";

export interface SearchHit { id: string; title: string; sub: string | null; badge: string | null; href: string }
export interface SearchGroup { type: string; items: SearchHit[] }

const LIMIT = 6; // لكل نوع

/**
 * بحث عام موحّد عبر الكيانات المحورية (عميل · وثيقة · مطالبة · طلب · شركة تأمين) بالاسم/الرقم.
 * كل نوع يُدرَج فقط إن ملك المستخدم صلاحية قراءته (RBAC) — فالبحث لا يكشف ما لا يُسمح برؤيته.
 * معزول بالمستأجر (Prisma middleware) — لا يتسرّب لكيانات مستأجر آخر.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perms: PermissionService,
  ) {}

  async search(user: { tenantId: string; roleId: string | null }, q: string): Promise<{ query: string; groups: SearchGroup[] }> {
    const term = (q ?? "").trim();
    if (term.length < 2) return { query: term, groups: [] };
    const like = { contains: term, mode: "insensitive" as const };

    // صلاحيات القراءة لكل نوع (يُقاس على موديوله في القائمة الجانبية)
    const [canClients, canPolicies, canClaims, canRequests, canInsurers] = await Promise.all([
      this.perms.can(user.roleId, "clients", "read"),
      this.perms.can(user.roleId, "production", "read"),
      this.perms.can(user.roleId, "claims", "read"),
      this.perms.can(user.roleId, "sales", "read"),
      this.perms.can(user.roleId, "finance", "read"),
    ]);
    const t = user.tenantId;

    const [clients, policies, claims, requests, insurers] = await Promise.all([
      canClients ? this.prisma.client.findMany({ where: { tenantId: t, OR: [{ name: like }, { code: like }] }, take: LIMIT, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }) : [],
      canPolicies ? this.prisma.policy.findMany({ where: { tenantId: t, OR: [{ sequenceNo: like }, { insurerPolicyNo: like }] }, take: LIMIT, orderBy: { createdAt: "desc" }, select: { id: true, sequenceNo: true, insurerName: true, status: true } }) : [],
      canClaims ? this.prisma.claim.findMany({ where: { tenantId: t, sequenceNo: like }, take: LIMIT, orderBy: { createdAt: "desc" }, select: { id: true, sequenceNo: true, status: true } }) : [],
      canRequests ? this.prisma.policyRequest.findMany({ where: { tenantId: t, sequenceNo: like }, take: LIMIT, orderBy: { createdAt: "desc" }, select: { id: true, sequenceNo: true, productLineCode: true, status: true } }) : [],
      canInsurers ? this.prisma.insurer.findMany({ where: { tenantId: t, OR: [{ name: like }, { nameEn: like }, { licenseNo: like }] }, take: LIMIT, orderBy: { name: "asc" }, select: { id: true, name: true, nameEn: true } }) : [],
    ]);

    const groups: SearchGroup[] = [];
    if (clients.length) groups.push({ type: "client", items: clients.map((c) => ({ id: c.id, title: c.name, sub: c.code, badge: null, href: `/tenant/clients/${c.id}` })) });
    if (policies.length) groups.push({ type: "policy", items: policies.map((p) => ({ id: p.id, title: p.sequenceNo ?? "—", sub: p.insurerName, badge: p.status, href: `/tenant/policies/${p.id}` })) });
    if (requests.length) groups.push({ type: "request", items: requests.map((r) => ({ id: r.id, title: r.sequenceNo ?? "—", sub: r.productLineCode, badge: r.status, href: `/tenant/requests/${r.id}` })) });
    if (claims.length) groups.push({ type: "claim", items: claims.map((c) => ({ id: c.id, title: c.sequenceNo ?? "—", sub: null, badge: c.status, href: `/tenant/claims/${c.id}` })) });
    if (insurers.length) groups.push({ type: "insurer", items: insurers.map((i) => ({ id: i.id, title: i.name, sub: i.nameEn, badge: null, href: `/tenant/insurers/${i.id}` })) });

    return { query: term, groups };
  }
}
