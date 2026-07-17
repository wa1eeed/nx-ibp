import { SandboxGateway } from "./sandbox.gateway";
import { TapGateway } from "./tap.gateway";
import { MoyasarGateway } from "./moyasar.gateway";
import type { PaymentGateway } from "./gateway.types";

/**
 * يبني بوّابة دفع بمفاتيح **المستأجر** (BYO) لدفع العميل.
 * في غير الإنتاج (بلا `PAYMENTS_LIVE=1`) يُستخدم `SandboxGateway` دائمًا — بلا شبكة،
 * حتمي للتطوير/الاختبار/الديمو. في الإنتاج يُبنى المحوّل الحقيقي بمفتاح المستأجر.
 */
export function makeTenantGateway(provider: string, secretKey: string): PaymentGateway {
  const live = process.env.PAYMENTS_LIVE === "1";
  if (!live) return new SandboxGateway();
  if (provider === "tap") return new TapGateway(secretKey);
  if (provider === "moyasar") return new MoyasarGateway(secretKey);
  throw new Error("بوّابة الدفع غير مدعومة");
}
