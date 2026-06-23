import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../../common/storage/storage.service";
import { EntitlementService } from "../rbac/entitlement.service";
import { AuditService } from "../../common/audit/audit.service";
import type { UploadUrlDto } from "./dto/upload-url.dto";

const DEFAULT_MAX_MB = 10;

/**
 * وحدة المستندات الموحّدة (polymorphic) — تخدم كل الموديولز.
 * رفع/عرض عبر روابط موقّتة فقط (لا روابط عامة)، عزل بالمسار + بطبقة التفويض،
 * حد الرفع كـ entitlement، تمييز الرسمي عن المرفق، وتسجيل كل رابط في التدقيق.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly entitlements: EntitlementService,
    private readonly audit: AuditService,
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

    const doc = await this.prisma.document.create({
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
    const { hash, size } = await this.storage.put(payload.sk, data);
    if (payload.did) {
      // سياق غير مصادَق ⇒ التحديث بالمعرّف الموثّق من التوكن (وثيقة أصدرناها)
      await this.prisma.document.update({ where: { id: payload.did }, data: { hash, sizeBytes: size } });
    }
    return { ok: true, size };
  }

  /** خدمة الملف عبر الرابط الموقّت. */
  async serveBlob(token: string): Promise<Buffer> {
    const payload = this.storage.verifyToken(token, "get");
    return this.storage.get(payload.sk);
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
}
