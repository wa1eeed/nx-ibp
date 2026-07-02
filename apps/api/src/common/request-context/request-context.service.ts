import { Injectable } from "@nestjs/common";
import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestStore {
  tenantId?: string;
  userId?: string;
  roleId?: string | null;
  email?: string;
  clientId?: string; // نطاق بوّابة العميل
  scope?: string; // "platform" | "client" | undefined (موظف مستأجر)
  ip?: string; // عنوان IP للطلب (للتدقيق)
  userAgent?: string; // بصمة الجهاز/المتصفح (للتدقيق)
}

/**
 * سياق الطلب عبر AsyncLocalStorage — يحمل المستأجر/المستخدم طوال عمر الطلب،
 * ويقرؤه Prisma middleware لفرض العزل تلقائياً دون تمرير tenantId يدوياً.
 */
@Injectable()
export class RequestContextService {
  private readonly als = new AsyncLocalStorage<RequestStore>();

  /** ينفّذ دالة ضمن سياق معطى (يلفّ بقية الطلب). */
  run<T>(store: RequestStore, fn: () => T): T {
    return this.als.run(store, fn);
  }

  get store(): RequestStore | undefined {
    return this.als.getStore();
  }

  get tenantId(): string | undefined {
    return this.als.getStore()?.tenantId;
  }

  get userId(): string | undefined {
    return this.als.getStore()?.userId;
  }

  get ip(): string | undefined {
    return this.als.getStore()?.ip;
  }

  get userAgent(): string | undefined {
    return this.als.getStore()?.userAgent;
  }
}
