import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * تشفير بيانات الاعتماد الحسّاسة at-rest (مفاتيح ZATCA الخاصة، الشهادات CCSID/PCSID).
 * AES-256-GCM. المفتاح من البيئة (ZATCA_ENC_KEY = 32 بايت Base64) — لا أسرار في الكود.
 * الصيغة المخزَّنة: base64(iv[12] | authTag[16] | ciphertext) — مكتفية ذاتياً لفكّ التشفير.
 */
@Injectable()
export class CryptoVaultService {
  private keyCache: Buffer | null = null;

  private key(): Buffer {
    if (this.keyCache) return this.keyCache;
    const raw = process.env.ZATCA_ENC_KEY;
    if (!raw) throw new InternalServerErrorException("ZATCA_ENC_KEY غير مُهيّأ — لا يمكن تشفير بيانات الاعتماد");
    const buf = Buffer.from(raw, "base64");
    if (buf.length !== 32) throw new InternalServerErrorException("ZATCA_ENC_KEY يجب أن يكون 32 بايت (Base64)");
    this.keyCache = buf;
    return buf;
  }

  /** يشفّر نصاً ويُعيد سلسلة Base64 قابلة للتخزين. */
  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key(), iv);
    const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ct]).toString("base64");
  }

  /** يفكّ تشفير سلسلة أنتجها encrypt. */
  decrypt(payload: string): string {
    const buf = Buffer.from(payload, "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", this.key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  }

  /**
   * يفكّ التشفير إن كانت القيمة مشفّرة، وإلا يُعيدها كما هي — **تسامح مع القيم القديمة
   * غير المشفّرة** (بيانات ما قبل تفعيل التشفير/البذرة). تحقّق مصادقة GCM يمنع فكّ
   * نصّ عادي بالخطأ (يفشل ⇒ يُعاد كما هو). آمن للحقول التي تنتقل تدريجيًا للتشفير.
   */
  tryDecrypt(payload?: string | null): string | null {
    if (!payload) return payload ?? null;
    try {
      return this.decrypt(payload);
    } catch {
      return payload; // قيمة غير مشفّرة (legacy) — تُعاد بلا تغيير
    }
  }

  /** قناع للعرض الآمن (لا يكشف القيمة) — لإظهار وجود اعتماد دون إفشائه. */
  mask(payload?: string | null): string | null {
    return payload ? `••••••••${payload.slice(-4)}` : null;
  }
}
