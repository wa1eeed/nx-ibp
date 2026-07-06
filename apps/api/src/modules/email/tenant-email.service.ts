import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Prisma } from "@ibp/db";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { RequestContextService } from "../../common/request-context/request-context.service";
import { CryptoVaultService } from "../../common/crypto/crypto-vault.service";
import { ConfigService } from "../config/config.service";
import { ResendClient, mapDomainStatus, type ResendDnsRecord } from "./resend.client";
import { renderBrandedEmail } from "./email-template";

const asJson = (v: unknown) => v as Prisma.InputJsonValue;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** إعدادات البريد كما تُعرَض للواجهة (بلا مفتاح خام أبدًا). */
export interface EmailSettingsView {
  fromEmail: string | null;
  fromName: string | null;
  domain: string | null;
  apiKeyMasked: string | null;
  hasApiKey: boolean;
  verificationStatus: string; // unconfigured | pending | verified | failed
  sendingMode: string; // fallback | tenant
  dnsRecords: ResendDnsRecord[];
  lastVerifiedAt: Date | null;
  fallbackFrom: string; // العنوان المركزي المستخدم في وضع fallback
}

/**
 * نظام بريد متعدّد المستأجرين عبر Resend (P0-A): كل مستأجر يرسل من إيميله الرسمي عبر
 * حساب Resend خاص (BYO) بربط آلي، مع fallback مركزي يضمن عدم الانقطاع، وترقية تلقائية
 * إلى وضع المستأجر بعد التحقّق من النطاق (DNS). المفتاح مشفّر at-rest ولا يُكشف أبدًا.
 */
@Injectable()
export class TenantEmailService {
  private readonly logger = new Logger(TenantEmailService.name);
  private readonly resend = new ResendClient();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ctx: RequestContextService,
    private readonly vault: CryptoVaultService,
    private readonly config: ConfigService,
  ) {}

  private fallbackFrom(): string {
    return process.env.EMAIL_FALLBACK_FROM ?? "notifications@mail.nx.sa";
  }

  /** وضع الإرسال الحيّ (Resend حقيقي). غير ذلك: محاكاة Sandbox (تطوير/اختبار) بلا شبكة. */
  private isLive(): boolean {
    return process.env.NOTIFY_GATEWAY === "live";
  }

  /** سجلّات DNS نموذجية للعرض في وضع Sandbox (تحاكي ما يعيده Resend). */
  private sandboxDns(domain: string): ResendDnsRecord[] {
    return [
      { type: "TXT", name: `send.${domain}`, value: "v=spf1 include:amazonses.com ~all", record: "SPF" },
      { type: "TXT", name: `resend._domainkey.${domain}`, value: "p=MIGfMA0GCSqGSIb3DQEBAQUAA...", record: "DKIM" },
      { type: "TXT", name: `_dmarc.${domain}`, value: "v=DMARC1; p=none;", record: "DMARC" },
    ];
  }

  private row(tenantId: string) {
    return this.ctx.run({}, async () => await this.prisma.tenantEmailSettings.findFirst({ where: { tenantId } }));
  }

  /** إعدادات البريد للعرض في الواجهة — بلا مفتاح خام (masked فقط). */
  async get(tenantId: string): Promise<EmailSettingsView> {
    const r = await this.row(tenantId);
    return {
      fromEmail: r?.fromEmail ?? null,
      fromName: r?.fromName ?? null,
      domain: r?.domain ?? null,
      apiKeyMasked: this.vault.mask(r?.resendApiKeyEncrypted ?? null),
      hasApiKey: !!r?.resendApiKeyEncrypted,
      verificationStatus: r?.verificationStatus ?? "unconfigured",
      sendingMode: r?.sendingMode ?? "fallback",
      dnsRecords: Array.isArray(r?.dnsRecords) ? (r!.dnsRecords as unknown as ResendDnsRecord[]) : [],
      lastVerifiedAt: r?.lastVerifiedAt ?? null,
      fallbackFrom: this.fallbackFrom(),
    };
  }

  /**
   * حفظ وربط: يتحقّق من الإيميل/المفتاح، يستخرج النطاق، ينشئ النطاق عبر مفتاح المستأجر،
   * يخزّن domain_id وسجلّات DNS (status=pending, mode=fallback) ويعرض DNS. لا يقطع الإشعارات
   * (تبقى تعمل عبر fallback حتى التحقّق).
   */
  async save(tenantId: string, userId: string, dto: { fromEmail: string; fromName: string; apiKey?: string }): Promise<EmailSettingsView> {
    const fromEmail = dto.fromEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(fromEmail)) throw new BadRequestException("صيغة البريد غير صحيحة");
    const domain = fromEmail.split("@")[1];
    const fromName = dto.fromName.trim();
    if (!fromName) throw new BadRequestException("اسم المرسِل مطلوب");

    const existing = await this.row(tenantId);
    // المفتاح: الجديد إن أُرسِل، وإلا نُبقي المخزَّن (تعديل الاسم/الإيميل دون إعادة إدخال المفتاح)
    let apiKey = dto.apiKey?.trim();
    if (!apiKey && existing?.resendApiKeyEncrypted) apiKey = this.vault.decrypt(existing.resendApiKeyEncrypted);
    if (!apiKey) throw new BadRequestException("مفتاح Resend مطلوب");
    if (!apiKey.startsWith("re_")) throw new BadRequestException("مفتاح Resend يجب أن يبدأ بـ re_");

    // أنشئ/اعثر على النطاق في حساب المستأجر عبر مفتاحه
    let resendDomainId = existing?.resendDomainId ?? null;
    let dnsRecords: ResendDnsRecord[] = Array.isArray(existing?.dnsRecords) ? (existing!.dnsRecords as unknown as ResendDnsRecord[]) : [];
    let status: "pending" | "verified" | "failed" = "pending";

    if (!this.isLive()) {
      // Sandbox (تطوير/اختبار): محاكاة إنشاء النطاق بلا شبكة — DNS نموذجية وحالة pending
      resendDomainId = resendDomainId ?? `sandbox-${domain}`;
      dnsRecords = this.sandboxDns(domain);
      status = "pending";
    } else {
      const created = await this.resend.createDomain(apiKey, domain);
      if (created.ok && created.data) {
        resendDomainId = created.data.id;
        dnsRecords = created.data.records ?? [];
        status = mapDomainStatus(created.data.status);
      } else {
        // قد يكون النطاق منشأً مسبقًا في حساب المستأجر — اعثر عليه بالقائمة
        const list = await this.resend.listDomains(apiKey);
        const found = list.ok ? list.data?.data?.find((d) => d.name === domain) : undefined;
        if (found) {
          resendDomainId = found.id;
          dnsRecords = found.records ?? [];
          status = mapDomainStatus(found.status);
        } else {
          // فشل حقيقي (مفتاح غير صالح غالبًا) — لا نخزّن مفتاحًا معطوبًا
          throw new BadRequestException(`تعذّر ربط النطاق عبر Resend: ${created.error ?? "تحقّق من صحّة المفتاح"}`);
        }
      }
    }

    const encrypted = this.vault.encrypt(apiKey);
    const data = {
      fromEmail,
      fromName,
      domain,
      resendApiKeyEncrypted: encrypted,
      resendDomainId,
      dnsRecords: asJson(dnsRecords),
      verificationStatus: status,
      // الترقية لوضع المستأجر فقط عند التحقّق؛ وإلا نبقى على fallback بلا انقطاع
      sendingMode: status === "verified" ? "tenant" : "fallback",
      lastVerifiedAt: status === "verified" ? new Date() : null,
    };
    await this.ctx.run({}, async () => {
      if (existing) await this.prisma.tenantEmailSettings.update({ where: { tenantId }, data });
      else await this.prisma.tenantEmailSettings.create({ data: { tenantId, ...data } });
    });
    await this.audit.log({ tenantId, userId, action: "update", entity: "email_settings", entityId: domain, meta: { status, domain } });
    return this.get(tenantId);
  }

  /**
   * تحقّق الآن: يستعلم حالة النطاق من Resend عبر مفتاح المستأجر، ويحدّث الحالة.
   * إذا verified: status=verified، sendingMode=tenant، lastVerifiedAt=now (ترقية تلقائية).
   */
  async verify(tenantId: string, userId: string | null): Promise<EmailSettingsView> {
    const r = await this.row(tenantId);
    if (!r?.resendApiKeyEncrypted || !r.resendDomainId) throw new BadRequestException("لا يوجد نطاق مربوط للتحقّق منه");

    let status: "verified" | "failed" | "pending";
    let dnsRecords = (r.dnsRecords as unknown as ResendDnsRecord[]) ?? [];
    if (!this.isLive()) {
      // Sandbox: يُعتبر النطاق مُوثّقًا عند «تحقّق الآن» (لمحاكاة الترقية التلقائية)
      status = "verified";
    } else {
      const apiKey = this.vault.decrypt(r.resendApiKeyEncrypted);
      // نطلب التحقّق ثم نقرأ الحالة (verify قد يعيد الحالة مباشرة)
      await this.resend.verifyDomain(apiKey, r.resendDomainId);
      const got = await this.resend.getDomain(apiKey, r.resendDomainId);
      status = got.ok && got.data ? mapDomainStatus(got.data.status) : "failed";
      dnsRecords = got.ok && got.data?.records ? got.data.records : dnsRecords;
    }
    const verified = status === "verified";
    await this.ctx.run({}, async () =>
      await this.prisma.tenantEmailSettings.update({
        where: { tenantId },
        data: {
          verificationStatus: status,
          dnsRecords: asJson(dnsRecords),
          sendingMode: verified ? "tenant" : "fallback",
          lastVerifiedAt: verified ? new Date() : r.lastVerifiedAt,
        },
      }),
    );
    if (verified && r.verificationStatus !== "verified") {
      await this.audit.log({ tenantId, userId: userId ?? "system", action: "update", entity: "email_settings", entityId: r.domain ?? "domain", meta: { upgraded: "tenant" } });
    }
    return this.get(tenantId);
  }

  /**
   * دالة الإرسال الموحّدة — تُستخدم لكل إشعارات البريد في المنصّة.
   * وضع tenant المُتحقَّق ⇒ عبر مفتاح المستأجر باسمه؛ وإلا fallback عبر المفتاح المركزي
   * من subdomain مركزي (notifications@mail.nx.sa) مع Reply-To إيميل المستأجر.
   */
  async sendTenantEmail(
    tenantId: string,
    to: string,
    subject: string,
    bodyText: string,
    locale: "ar" | "en" = "ar",
  ): Promise<{ ok: boolean; via: "tenant" | "fallback" | "disabled"; id?: string }> {
    const r = await this.row(tenantId);
    const branding = await this.config.getBranding(tenantId);
    const html = renderBrandedEmail({ branding, locale, subject, bodyText });

    const central = process.env.RESEND_API_KEY;
    const canTenant = r?.sendingMode === "tenant" && r?.verificationStatus === "verified" && !!r?.resendApiKeyEncrypted && !!r?.fromEmail;

    // وضع المستأجر المُتحقَّق
    if (canTenant) {
      const apiKey = this.vault.decrypt(r!.resendApiKeyEncrypted!);
      const from = `${sanitizeName(r!.fromName ?? "")} <${r!.fromEmail}>`;
      const res = await this.resend.sendEmail(apiKey, { from, to, subject, html, text: bodyText });
      if (res.ok) {
        this.logger.log(`بريد عبر مستأجر (${tenantId}) → ${to}`);
        return { ok: true, via: "tenant", id: res.data?.id };
      }
      this.logger.warn(`فشل بريد المستأجر (${tenantId})، تحويل لـ fallback`);
      // fall through للـ fallback عند فشل مفتاح المستأجر
    }

    // fallback مركزي (بلا مفتاح مركزي ⇒ لا إرسال حقيقي، Sandbox/تطوير)
    if (!central) {
      this.logger.log(`[sandbox email] → ${to} :: ${subject}`);
      return { ok: true, via: "disabled" };
    }
    const displayName = r?.fromName || branding.displayName || branding.logoText || "IBP";
    const from = `${sanitizeName(displayName)} <${this.fallbackFrom()}>`;
    const res = await this.resend.sendEmail(central, { from, to, subject, html, text: bodyText, replyTo: r?.fromEmail ?? undefined });
    if (res.ok) {
      this.logger.log(`بريد عبر fallback → ${to}`);
      return { ok: true, via: "fallback", id: res.data?.id };
    }
    this.logger.warn(`فشل بريد fallback → ${to}: ${res.error}`);
    return { ok: false, via: "fallback" };
  }

  /** مجدول دوري (كل 30 دقيقة): يرقّي النطاقات المعلّقة تلقائيًا حال اكتمال DNS. */
  @Cron(CronExpression.EVERY_30_MINUTES, { name: "email-domain-verify" })
  async scheduledVerify(): Promise<void> {
    if (!process.env.RESEND_API_KEY && process.env.NOTIFY_GATEWAY !== "live") return; // لا شبكة في التطوير/الاختبار
    const r = await this.verifyPending();
    if (r.upgraded) this.logger.log(`ترقية آلية لنطاقات البريد: ${r.upgraded}/${r.checked}`);
  }

  /**
   * مسح دوري (cron): يرقّي كل مستأجر معلّق نطاقُه إلى verified تلقائيًا حال اكتمال DNS.
   * يعمل خارج سياق أي مستأجر. لا يرمي.
   */
  async verifyPending(): Promise<{ checked: number; upgraded: number }> {
    const pending = await this.ctx.run({}, async () =>
      await this.prisma.tenantEmailSettings.findMany({ where: { verificationStatus: "pending", resendDomainId: { not: null } }, select: { tenantId: true } }),
    );
    let upgraded = 0;
    for (const p of pending) {
      try {
        const before = await this.row(p.tenantId);
        const after = await this.verify(p.tenantId, null);
        if (before?.verificationStatus !== "verified" && after.verificationStatus === "verified") upgraded += 1;
      } catch (e) {
        this.logger.warn(`تعذّر تحقّق دوري (${p.tenantId}): ${(e as Error).message}`);
      }
    }
    return { checked: pending.length, upgraded };
  }
}

/** يزيل المحارف التي تكسر ترويسة From (< > " \n). */
function sanitizeName(name: string): string {
  return name.replace(/["<>\r\n]/g, "").trim() || "IBP";
}
