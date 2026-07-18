import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ibp/db";
import { PrismaService } from "../../prisma/prisma.service";
import { SequenceService } from "../../common/sequence/sequence.service";
import { AuditService } from "../../common/audit/audit.service";

const num = (d: Prisma.Decimal | number | null) => (d == null ? 0 : Number(d));
const r2 = (n: number) => Math.round(n * 100) / 100;
const asJson = (v: unknown) => v as Prisma.InputJsonValue;
const SALARIES = "05030000000000000"; // الرواتب والأجور (مصروف)
const CASH = "01010000000000000"; // النقد والبنوك
const net = (l: { baseSalary: Prisma.Decimal | number; allowances: Prisma.Decimal | number; deductions: Prisma.Decimal | number }) =>
  r2(num(l.baseSalary) + num(l.allowances) - num(l.deductions));

/**
 * §8.1 — الرواتب: كشف رواتب لفترة (شهر) ببنود لكل موظف (أساسي + بدلات − استقطاعات = صافي).
 * عند **الترحيل** يُنشأ سند مصروف (JRV): مدين **الرواتب والأجور (05030)** / دائن **النقد (0101)** بصافي الكشف.
 * عمولات الموظفين (§3.1) منفصلة (حساب 05020)؛ الكشف للرواتب فقط. معزول بالمستأجر وبصلاحية `finance`.
 */
@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seq: SequenceService,
    private readonly audit: AuditService,
  ) {}

  /** كشوف الرواتب (أحدث أولًا) بصافي كل كشف. */
  async list() {
    const runs = await this.prisma.payrollRun.findMany({ orderBy: { period: "desc" }, include: { lines: true } });
    return runs.map((r) => ({ id: r.id, period: r.period, status: r.status, postedAt: r.postedAt, voucherId: r.voucherId, count: r.lines.length, net: r2(r.lines.reduce((s, l) => s + net(l), 0)) }));
  }

  /** كشف مع بنوده ومجاميعه. */
  async get(id: string) {
    const run = await this.prisma.payrollRun.findFirst({ where: { id }, include: { lines: { orderBy: { employeeName: "asc" } } } });
    if (!run) throw new NotFoundException("كشف الرواتب غير موجود");
    const lines = run.lines.map((l) => ({ id: l.id, userId: l.userId, employeeName: l.employeeName, baseSalary: num(l.baseSalary), allowances: num(l.allowances), deductions: num(l.deductions), net: net(l) }));
    return {
      id: run.id, period: run.period, status: run.status, notes: run.notes, postedAt: run.postedAt, voucherId: run.voucherId,
      lines,
      totals: { base: r2(lines.reduce((s, l) => s + l.baseSalary, 0)), allowances: r2(lines.reduce((s, l) => s + l.allowances, 0)), deductions: r2(lines.reduce((s, l) => s + l.deductions, 0)), net: r2(lines.reduce((s, l) => s + l.net, 0)) },
    };
  }

  /** إنشاء كشف مسودّة لفترة + تعبئته آليًا بالموظفين النشطين (أساسي 0 قابل للتعديل). */
  async create(tenantId: string, userId: string, period: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new BadRequestException("الفترة بصيغة YYYY-MM");
    const dup = await this.prisma.payrollRun.findFirst({ where: { period }, select: { id: true } });
    if (dup) throw new ConflictException("يوجد كشف رواتب لهذه الفترة");
    const staff = await this.prisma.user.findMany({ where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" }, select: { id: true, fullName: true } });
    const run = await this.prisma.payrollRun.create({
      data: { tenantId, period, createdBy: userId, lines: { create: staff.map((u) => ({ userId: u.id, employeeName: u.fullName })) } },
      select: { id: true },
    });
    await this.audit.log({ tenantId, userId, action: "create", entity: "payroll_run", entityId: run.id, meta: { period, employees: staff.length } });
    return this.get(run.id);
  }

  /** تعديل بند (كشف مسودّة فقط). */
  async updateLine(tenantId: string, userId: string, lineId: string, dto: { baseSalary?: number; allowances?: number; deductions?: number }) {
    const line = await this.prisma.payrollLine.findFirst({ where: { id: lineId }, include: { run: { select: { id: true, status: true } } } });
    if (!line) throw new NotFoundException("بند الرواتب غير موجود");
    if (line.run.status !== "draft") throw new ConflictException("لا يُعدَّل بند كشف مُرحَّل");
    const data: Record<string, number> = {};
    for (const k of ["baseSalary", "allowances", "deductions"] as const) {
      const v = dto[k];
      if (v != null) { if (v < 0) throw new BadRequestException("القيم غير سالبة"); data[k] = r2(v); }
    }
    await this.prisma.payrollLine.update({ where: { id: lineId }, data });
    await this.audit.log({ tenantId, userId, action: "update", entity: "payroll_line", entityId: lineId, meta: data });
    return this.get(line.run.id);
  }

  /** ترحيل الكشف ⇒ سند مصروف (مدين رواتب 05030 / دائن نقد 0101) بصافي الكشف. مسودّة فقط. */
  async post(tenantId: string, userId: string, runId: string) {
    const run = await this.prisma.payrollRun.findFirst({ where: { id: runId }, include: { lines: true } });
    if (!run) throw new NotFoundException("كشف الرواتب غير موجود");
    if (run.status !== "draft") throw new ConflictException("الكشف مُرحَّل مسبقًا");
    const total = r2(run.lines.reduce((s, l) => s + net(l), 0));
    if (!(total > 0)) throw new BadRequestException("صافي الكشف يجب أن يكون موجبًا قبل الترحيل");
    const voucherSeq = await this.seq.nextVoucherSeq("JRV");
    const result = await this.prisma.$transaction(async (tx) => {
      const voucher = await tx.voucher.create({
        data: {
          tenantId, type: "JRV", sequenceNo: voucherSeq, amount: total, status: "posted", isAuto: true, reference: runId,
          lines: asJson({ description: `رواتب ${run.period} — صرف رواتب الموظفين`, entries: [
            { account: SALARIES, name: "الرواتب والأجور", debit: total, credit: 0 },
            { account: CASH, name: "النقد والبنوك", debit: 0, credit: total },
          ] }),
        },
        select: { id: true, sequenceNo: true },
      });
      await tx.payrollRun.update({ where: { id: runId }, data: { status: "posted", postedAt: new Date(), voucherId: voucher.id } });
      return voucher;
    });
    await this.audit.log({ tenantId, userId, action: "update", entity: "payroll_post", entityId: runId, meta: { voucher: result.sequenceNo, net: total } });
    return { ok: true, voucher: { id: result.id, sequenceNo: result.sequenceNo }, net: total };
  }

  /** حذف كشف مسودّة (المُرحَّل لا يُحذف — أثره محاسبي). */
  async remove(tenantId: string, userId: string, runId: string) {
    const run = await this.prisma.payrollRun.findFirst({ where: { id: runId }, select: { id: true, status: true } });
    if (!run) throw new NotFoundException("كشف الرواتب غير موجود");
    if (run.status !== "draft") throw new ConflictException("لا يُحذف كشف مُرحَّل");
    await this.prisma.payrollRun.deleteMany({ where: { id: runId } });
    await this.audit.log({ tenantId, userId, action: "delete", entity: "payroll_run", entityId: runId });
    return { ok: true };
  }
}
