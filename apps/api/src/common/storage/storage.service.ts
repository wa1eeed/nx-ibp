import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export interface PresignedTokenPayload {
  sk: string; // storageKey
  op: "put" | "get";
  did?: string; // documentId
  max?: number; // أقصى حجم بايت مسموح (يُفرض عند الرفع الفعلي)
}

/**
 * خدمة التخزين — حيادية المزوّد (STORAGE_DRIVER). تولّد **روابط موقّتة موقّعة**
 * (Presigned URLs) قصيرة العمر — لا روابط عامة إطلاقاً. عزل منطقي بالمسار
 * tenant_{id}/. سائق `local` للتطوير (يخزّن تحت .storage ويخدم عبر API)؛
 * سائق `s3`/`minio`/`alibaba_oss`/`gcs` للإنتاج (يُوصَّل في المرحلة 9).
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver = process.env.STORAGE_DRIVER ?? "local";
  private readonly root = resolve(process.cwd(), process.env.STORAGE_LOCAL_DIR ?? ".storage");
  private readonly apiBase = process.env.NEXT_PUBLIC_API_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`;
  private readonly expiry = Number(process.env.PRESIGNED_URL_EXPIRY_SECONDS ?? 300);

  // أنواع MIME المسموحة (رفض التنفيذي وأي نوع خارج القائمة)
  private readonly allowedMime = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

  constructor(private readonly jwt: JwtService) {}

  private sign(payload: PresignedTokenPayload): string {
    return this.jwt.sign(payload, { expiresIn: this.expiry });
  }

  isMimeAllowed(mime: string): boolean {
    return this.allowedMime.has(mime);
  }

  /** بناء مفتاح التخزين المعزول؛ صور المرفقات تستهدف WebP لتوفير المساحة. */
  buildKey(tenantId: string, entityType: string, fileName: string, mime: string, isOfficial: boolean): string {
    const safe = fileName.replace(/[^\w.\-]+/g, "_").slice(0, 80);
    const base = safe.replace(/\.[^.]+$/, "");
    const compressible = !isOfficial && mime.startsWith("image/") && mime !== "image/webp";
    const ext = compressible ? "webp" : (safe.match(/\.([^.]+)$/)?.[1] ?? "bin");
    return `tenant_${tenantId}/${entityType}/${randomUUID()}__${base}.${ext}`;
  }

  presignUpload(storageKey: string, documentId: string, maxBytes: number): { url: string; method: "PUT"; expiresIn: number } {
    const token = this.sign({ sk: storageKey, op: "put", did: documentId, max: maxBytes });
    return { url: `${this.apiBase}/documents/blob/${token}`, method: "PUT", expiresIn: this.expiry };
  }

  presignDownload(storageKey: string): { url: string; expiresIn: number } {
    const token = this.sign({ sk: storageKey, op: "get" });
    return { url: `${this.apiBase}/documents/blob/${token}`, expiresIn: this.expiry };
  }

  verifyToken(token: string, op: "put" | "get"): PresignedTokenPayload {
    let payload: PresignedTokenPayload;
    try {
      payload = this.jwt.verify<PresignedTokenPayload>(token);
    } catch {
      throw new ForbiddenException("رابط منتهٍ أو غير صالح");
    }
    if (payload.op !== op) throw new ForbiddenException("نوع العملية غير مطابق للرابط");
    return payload;
  }

  /** كتابة الكائن (سائق محلي). صور المرفقات: يُطبّق الضغط في الإنتاج (سائق s3/worker). */
  async put(storageKey: string, data: Buffer): Promise<{ hash: string; size: number }> {
    if (this.driver !== "local") {
      // الإنتاج: يُرفع مباشرةً إلى المزوّد عبر الرابط الموقّع — لا يمرّ بالـ API.
      throw new ForbiddenException("الرفع المباشر متاح فقط مع السائق المحلي");
    }
    const full = join(this.root, storageKey);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, data);
    const hash = createHash("sha256").update(data).digest("hex");
    return { hash, size: data.length };
  }

  async get(storageKey: string): Promise<Buffer> {
    const full = join(this.root, storageKey);
    return readFile(full);
  }
}
