import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import sharp from "sharp";
import { S3StorageDriver, type S3Config } from "./s3-driver";

const MAX_IMAGE_DIM = 1200; // أقصى بُعد للصور المضغوطة
const WEBP_QUALITY = 80;

export interface PresignedTokenPayload {
  sk: string; // storageKey
  op: "put" | "get";
  did?: string; // documentId
  max?: number; // أقصى حجم بايت مسموح (يُفرض عند الرفع الفعلي)
}

export interface PresignedUpload {
  url: string;
  method: "PUT";
  expiresIn: number;
  /** true ⇒ الرفع مباشر للدلو (سحابي) فيلزم تأكيد لاحق؛ false ⇒ يمرّ بالـ API. */
  direct: boolean;
}

const S3_DRIVERS = new Set(["s3", "r2", "minio", "alibaba_oss"]);

/**
 * خدمة التخزين — حيادية المزوّد (STORAGE_DRIVER). تولّد **روابط موقّتة موقّعة**
 * (Presigned URLs) قصيرة العمر — لا روابط عامة إطلاقاً. عزل منطقي بالمسار
 * tenant_{id}/. سائق `local` للتطوير (يخزّن تحت .storage ويخدم عبر API)؛
 * سائق `s3`/`r2`/`minio`/`alibaba_oss` للإنتاج (متوافق S3، روابط مباشِرة للدلو).
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver = process.env.STORAGE_DRIVER ?? "local";
  private readonly root = resolve(process.cwd(), process.env.STORAGE_LOCAL_DIR ?? ".storage");
  private readonly apiBase = process.env.NEXT_PUBLIC_API_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`;
  private readonly expiry = Number(process.env.PRESIGNED_URL_EXPIRY_SECONDS ?? 300);
  private readonly s3?: S3StorageDriver;

  // أنواع MIME المسموحة (رفض التنفيذي وأي نوع خارج القائمة)
  private readonly allowedMime = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

  constructor(private readonly jwt: JwtService) {
    if (S3_DRIVERS.has(this.driver)) {
      this.s3 = new S3StorageDriver(this.readS3Config());
      this.logger.log(`تخزين سحابي مفعّل (${this.driver}) — روابط مباشِرة للدلو`);
    } else if (this.driver !== "local") {
      throw new Error(`STORAGE_DRIVER غير مدعوم: ${this.driver} (المتاح: local|s3|r2|minio|alibaba_oss)`);
    }
  }

  private readS3Config(): S3Config {
    const need = (k: string): string => {
      const v = process.env[k];
      if (!v) throw new Error(`متغيّر التخزين السحابي مفقود: ${k}`);
      return v;
    };
    return {
      endpoint: need("STORAGE_ENDPOINT"),
      region: process.env.STORAGE_REGION ?? "auto",
      bucket: need("STORAGE_BUCKET"),
      accessKeyId: need("STORAGE_ACCESS_KEY"),
      secretAccessKey: need("STORAGE_SECRET_KEY"),
      forcePathStyle: (process.env.STORAGE_FORCE_PATH_STYLE ?? "true") !== "false",
    };
  }

  /** هل تمرّ الروابط بالـ API (محلي) أم مباشِرة للدلو (سحابي)؟ */
  isProxied(): boolean {
    return !this.s3;
  }

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

  presignUpload(storageKey: string, documentId: string, maxBytes: number): PresignedUpload {
    if (this.s3) {
      // سحابي: رابط PUT مباشر للدلو — لا يمرّ بالـ API. يلزم تأكيد بعد الرفع.
      return { url: this.s3.presignPut(storageKey, this.expiry), method: "PUT", expiresIn: this.expiry, direct: true };
    }
    const token = this.sign({ sk: storageKey, op: "put", did: documentId, max: maxBytes });
    return { url: `${this.apiBase}/documents/blob/${token}`, method: "PUT", expiresIn: this.expiry, direct: false };
  }

  presignDownload(storageKey: string): { url: string; expiresIn: number } {
    if (this.s3) {
      return { url: this.s3.presignGet(storageKey, this.expiry), expiresIn: this.expiry };
    }
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

  /**
   * ضغط الصور القابلة للضغط (المرحلة D2): إن كان المفتاح يستهدف WebP، تُعاد
   * الصورة WebP (جودة 80، أقصى بُعد 1200px). غير الصور/الفشل ⇒ الأصل كما هو.
   * يُطبَّق في مسار الرفع المحلي فقط (السحابي المباشر يحتاج worker — مؤجَّل).
   */
  async maybeCompress(storageKey: string, data: Buffer): Promise<Buffer> {
    if (!storageKey.endsWith(".webp")) return data;
    try {
      const out = await sharp(data)
        .rotate() // احترام اتجاه EXIF
        .resize({ width: MAX_IMAGE_DIM, height: MAX_IMAGE_DIM, fit: "inside", withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();
      return out.length < data.length ? out : data; // لا تكبّر الحجم
    } catch {
      this.logger.warn("تعذّر ضغط الصورة — حُفظ الأصل");
      return data;
    }
  }

  /** كتابة الكائن خادميًا (مستندات مولّدة كفواتير ZATCA). سحابي ⇒ S3؛ محلي ⇒ نظام الملفات. */
  async put(storageKey: string, data: Buffer): Promise<{ hash: string; size: number }> {
    if (this.s3) return this.s3.put(storageKey, data);
    const full = join(this.root, storageKey);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, data);
    const hash = createHash("sha256").update(data).digest("hex");
    return { hash, size: data.length };
  }

  async get(storageKey: string): Promise<Buffer> {
    if (this.s3) return this.s3.get(storageKey);
    const full = join(this.root, storageKey);
    return readFile(full);
  }

  /** بيانات الكائن (الحجم) — للتأكيد بعد الرفع المباشر السحابي. */
  async head(storageKey: string): Promise<{ size: number; etag?: string }> {
    if (this.s3) return this.s3.head(storageKey);
    const s = await stat(join(this.root, storageKey));
    return { size: s.size };
  }
}
