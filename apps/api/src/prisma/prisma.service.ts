import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from "@nestjs/common";
import { PrismaClient, Prisma } from "@ibp/db";
import { RequestContextService } from "../common/request-context/request-context.service";

/** أسماء الموديلز التي تحمل tenantId — تُشتقّ آلياً من DMMF (لا قائمة صلبة). */
const TENANT_MODELS = new Set(
  Prisma.dmmf.datamodel.models
    .filter((m) => m.fields.some((f) => f.name === "tenantId"))
    .map((m) => m.name),
);

const READ_INJECT = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "deleteMany",
]);

/**
 * عميل Prisma كخدمة Nest، مع middleware يفرض فلترة tenantId تلقائياً على كل
 * استعلام لموديل يحمل tenantId — جوهر عزل المستأجرين (CLAUDE.md §3).
 * عند غياب سياق المستأجر (مثل تسجيل الدخول) يُتخطّى الفرض.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly ctx: RequestContextService) {
    super();
    this.installTenantGuard();
  }

  private installTenantGuard(): void {
    this.$use(async (params, next) => {
      const tenantId = this.ctx.tenantId;

      // بلا سياق مستأجر (إقلاع/مصادقة/سوبر أدمن لاحقاً) ⇒ لا فرض.
      if (!tenantId || !params.model || !TENANT_MODELS.has(params.model)) {
        return next(params);
      }

      const action = params.action;
      params.args = params.args ?? {};

      if (READ_INJECT.has(action)) {
        params.args.where = { ...(params.args.where ?? {}), tenantId };
      } else if (action === "findUnique" || action === "findUniqueOrThrow") {
        // أعِد التوجيه إلى findFirst لإمكان إضافة tenantId ⇒ معرّف مستأجر آخر = غير موجود
        params.action = action === "findUnique" ? "findFirst" : "findFirstOrThrow";
        params.args.where = { ...(params.args.where ?? {}), tenantId };
      } else if (action === "create") {
        params.args.data = { ...(params.args.data ?? {}), tenantId };
      } else if (action === "createMany") {
        const d = params.args.data;
        params.args.data = Array.isArray(d)
          ? d.map((row: Record<string, unknown>) => ({ ...row, tenantId }))
          : { ...(d ?? {}), tenantId };
      } else if (action === "update" || action === "delete") {
        // إضافة tenantId للـ where ⇒ تعديل/حذف عبر المستأجرين يفشل (P2025)
        params.args.where = { ...(params.args.where ?? {}), tenantId };
      } else if (action === "upsert") {
        params.args.where = { ...(params.args.where ?? {}), tenantId };
        params.args.create = { ...(params.args.create ?? {}), tenantId };
      }

      return next(params);
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log(`اتصال قاعدة البيانات جاهز — العزل مفعّل على ${TENANT_MODELS.size} موديل`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
