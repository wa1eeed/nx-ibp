import { Injectable } from "@nestjs/common";

// تمثيل مبسّط لتعريفات المخطط القادمة من قاعدة البيانات (JSON).
export interface FieldDef {
  key: string;
  type: string;
  required?: boolean;
  options?: Array<{ value: string }>;
  min?: number;
  max?: number;
}
export interface SectionDef {
  key: string;
  fields: FieldDef[];
}
export interface BlockDef {
  key: string;
  min?: number;
  max?: number;
  fields: FieldDef[];
}

export interface FormPayload {
  base?: Record<string, unknown>;
  blocks?: Record<string, Array<Record<string, unknown>>>;
}

/**
 * محرّك التحقّق العام: يتحقّق من حمولة النموذج ضد مخطط الفرع (FormSchema).
 * يعمل لأي منتج تأمين (طبي/مركبات/عام/حياة…) دون كود خاص بكل فرع.
 */
@Injectable()
export class FormValidationService {
  validate(sections: SectionDef[], blocks: BlockDef[], payload: FormPayload): string[] {
    const errors: string[] = [];
    const base = payload.base ?? {};

    for (const sec of sections ?? []) {
      for (const f of sec.fields ?? []) {
        this.checkField(f.key, f, base[f.key], errors);
      }
    }

    for (const b of blocks ?? []) {
      const rows = payload.blocks?.[b.key];
      if (b.min && (!Array.isArray(rows) || rows.length < b.min)) {
        errors.push(`الكتلة "${b.key}": مطلوب ${b.min} صف على الأقل`);
        continue;
      }
      if (Array.isArray(rows)) {
        if (b.max && rows.length > b.max) errors.push(`الكتلة "${b.key}": الحد الأقصى ${b.max} صف`);
        rows.forEach((row, i) => {
          for (const f of b.fields ?? []) {
            this.checkField(`${b.key}[${i}].${f.key}`, f, row?.[f.key], errors);
          }
        });
      }
    }

    return errors;
  }

  private checkField(path: string, f: FieldDef, value: unknown, errors: string[]): void {
    const empty = value === undefined || value === null || value === "";
    if (f.required && empty) {
      errors.push(`${path}: حقل مطلوب`);
      return;
    }
    if (empty) return;

    switch (f.type) {
      case "number":
      case "currency":
      case "percent": {
        const n = Number(value);
        if (Number.isNaN(n)) {
          errors.push(`${path}: يجب أن يكون رقماً`);
          break;
        }
        if (f.min != null && n < f.min) errors.push(`${path}: أقل من الحد ${f.min}`);
        if (f.max != null && n > f.max) errors.push(`${path}: أكبر من الحد ${f.max}`);
        break;
      }
      case "date":
        if (Number.isNaN(Date.parse(String(value)))) errors.push(`${path}: تاريخ غير صالح`);
        break;
      case "select":
        if (f.options && !f.options.some((o) => o.value === value)) errors.push(`${path}: قيمة غير مسموحة`);
        break;
      case "nationalId":
        if (!/^\d{10}$/.test(String(value))) errors.push(`${path}: الهوية يجب أن تكون 10 أرقام`);
        break;
      case "email":
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value))) errors.push(`${path}: بريد غير صالح`);
        break;
      case "boolean":
        if (typeof value !== "boolean") errors.push(`${path}: قيمة منطقية متوقّعة`);
        break;
      default:
        break;
    }
  }
}
