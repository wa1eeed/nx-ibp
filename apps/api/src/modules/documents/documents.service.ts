import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../../common/storage/storage.service";
import { EntitlementService } from "../rbac/entitlement.service";
import { AuditService } from "../../common/audit/audit.service";
import { StorageUsageService } from "./storage-usage.service";
import type { UploadUrlDto } from "./dto/upload-url.dto";

const DEFAULT_MAX_MB = 10;

/**
 * وحدة المستندات الموحّدة (polymorphic) — تخدم كل الموديولز.
 * رفع/عرض عبر روابط موقّتة فقط (لا روابط عامة)، عزل بالمسار + بطبقة التفويض،
 * حد الرفع كـ entitlement، **حصّة تخزين ذرّية** لكل مستأجر، تمييز الرسمي، وتسجيل التدقيق.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly entitlements: EntitlementService,
    private readonly audit: AuditService,
    private readonly storageUsage: StorageUsageService,
  ) {}

  /** الخطوة 1: طلب رابط رفع موقّت (بعد التحقّق من النوع والحد). */
  async createUploadUrl(tenantId: string, userId: string, dto: UploadUrlDto) {
    // فحص نوع MIME (رفض التنفيذي وأي نوع خارج القائمة)
    if (!this.storage.isMimeAllowed(dto.mime)) {
      throw new BadRequestException("نوع الملف غير مسموح (المسموح: PDF/JPEG/PNG/WebP)");
    }
    // حد الرفع من الباقة (entitlement upload.maxFileMb)
    const maxMb = (await this.entitlements.getNumericValue(tenantId, "upload.maxFileMb")) ?? DEFAULT_MAX_MB;
    const maxBytes = maxMb * 1024 * 1024;
    if (dto.sizeBytes > maxBytes) {
      throw new ForbiddenException(`حجم الملف يتجاوز حد باقتك (${maxMb}MB)`);
    }

    const isOfficial = dto.docType === "OFFICIAL";
    const storageKey = this.storage.buildKey(tenantId, dto.entityType, dto.fileName, dto.mime, isOfficial);

    // حجز ذرّي لحصّة التخزين (يفشل بـ 403 إن تجاوز حصّة المستأجر)
    await this.storageUsage.reserve(tenantId, dto.sizeBytes);

    const doc = await this.prisma.document
      .create({
        data: {
          tenantId,
          storageKey,
          fileName: dto.fileName,
          mime: dto.mime,
          sizeBytes: dto.sizeBytes,
          hash: "pending",
          docType: isOfficial ? "OFFICIAL" : "ATTACHMENT",
          entityType: dto.entityType,
          entityId: dto.entityId,
          rowId: dto.rowId ?? null,
        },
        select: { id: true, storageKey: true, docType: true },
      })
      .catch(async (e) => {
        await this.storageUsage.release(tenantId, dto.sizeBytes); // تحرير الحجز عند فشل الإنشاء
        throw e;
      });

    await this.audit.log({ tenantId, userId, action: "create", entity: "document", entityId: doc.id, meta: { storageKey } });
    return { documentId: doc.id, docType: doc.docType, upload: this.storage.presignUpload(storageKey, doc.id, maxBytes) };
  }

  /** الخطوة 2: استقبال البايتات عبر الرابط الموقّت (بلا مصادقة — التوكن هو التفويض). */
  async receiveBlob(token: string, data: Buffer) {
    const payload = this.storage.verifyToken(token, "put");
    if (payload.max != null && data.length > payload.max) {
      throw new ForbiddenException("حجم الملف الفعلي يتجاوز الحد");
    }
    // ضغط الصور القابلة للضغط قبل التخزين (WebP/80%/≤1200px) — المسار المحلي
    const bytes = await this.storage.maybeCompress(payload.sk, data);
    const { hash, size } = await this.storage.put(payload.sk, bytes);
    if (payload.did) {
      // سياق غير مصادَق ⇒ التحديث بالمعرّف الموثّق من التوكن (وثيقة أصدرناها)
      const prev = await this.prisma.document.findFirst({ where: { id: payload.did }, select: { tenantId: true, sizeBytes: true } });
      await this.prisma.document.update({ where: { id: payload.did }, data: { hash, sizeBytes: size } });
      // مطابقة الحصّة بالفرق بين المحجوز (المعلَن) والفعلي
      if (prev) await this.storageUsage.reconcile(prev.tenantId, size - prev.sizeBytes);
    }
    return { ok: true, size };
  }

  /** خدمة الملف عبر الرابط الموقّت. */
  async serveBlob(token: string): Promise<Buffer> {
    const payload = this.storage.verifyToken(token, "get");
    return this.storage.get(payload.sk);
  }

  /**
   * تأكيد الرفع المباشر (سحابي): البايتات صعدت للدلو دون مرورها بالـ API،
   * فنتحقّق من وجودها وحجمها (HEAD) ونثبّت الحجم/البصمة. معزول بالمستأجر.
   */
  async confirmUpload(tenantId: string, userId: string, documentId: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId },
      select: { id: true, tenantId: true, storageKey: true, sizeBytes: true },
    });
    if (!doc) throw new NotFoundException("المستند غير موجود");

    const head = await this.storage.head(doc.storageKey);
    const maxMb = (await this.entitlements.getNumericValue(tenantId, "upload.maxFileMb")) ?? DEFAULT_MAX_MB;
    if (head.size > maxMb * 1024 * 1024) {
      throw new ForbiddenException(`حجم الملف يتجاوز حد باقتك (${maxMb}MB)`);
    }
    await this.prisma.document.update({
      where: { id: doc.id },
      data: { sizeBytes: head.size, hash: head.etag ? `etag:${head.etag}` : "uploaded" },
    });
    // مطابقة الحصّة بالفرق بين المحجوز والفعلي
    await this.storageUsage.reconcile(tenantId, head.size - doc.sizeBytes);
    await this.audit.log({ tenantId, userId, action: "update", entity: "document", entityId: doc.id, meta: { confirmed: true, size: head.size } });
    return { ok: true, size: head.size };
  }

  /** توليد رابط عرض موقّت (5 دقائق) + تسجيل التوليد في التدقيق (مطلب). */
  async getViewUrl(tenantId: string, userId: string, id: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id },
      select: { id: true, storageKey: true, fileName: true, mime: true },
    });
    if (!doc) throw new NotFoundException("المستند غير موجود");

    await this.audit.log({ tenantId, userId, action: "file_url", entity: "document", entityId: id, meta: { storageKey: doc.storageKey } });
    return { fileName: doc.fileName, mime: doc.mime, view: this.storage.presignDownload(doc.storageKey) };
  }

  list(entityType: string, entityId: string) {
    return this.prisma.document.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: "desc" },
      select: { id: true, fileName: true, mime: true, sizeBytes: true, docType: true, tenantId: true, createdAt: true },
    });
  }

  /** المستودع المركزي: كل مستندات المستأجر (مفلترة تلقائيًا بالمستأجر) مع فلاتر النوع/التصنيف/البحث. */
  listAll(filter: { docType?: string; entityType?: string; q?: string } = {}) {
    const where: Record<string, unknown> = {};
    if (filter.docType) where.docType = filter.docType;
    if (filter.entityType) where.entityType = filter.entityType;
    if (filter.q && filter.q.trim()) where.fileName = { contains: filter.q.trim(), mode: "insensitive" };
    return this.prisma.document.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { id: true, fileName: true, mime: true, sizeBytes: true, docType: true, entityType: true, entityId: true, createdAt: true },
    });
  }
}
