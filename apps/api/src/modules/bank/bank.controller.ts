import { Body, Controller, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import { BankService } from "./bank.service";
import { CreateBankAccountDto, ImportTransactionsDto, MatchTransactionDto, SetTxnStatusDto } from "./dto/bank.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

/** الحسابات البنكية والتسوية البنكية (§1.6) — تحت صلاحية المالية (`finance`). */
@Controller("finance/bank")
export class BankController {
  constructor(private readonly bank: BankService) {}

  @Authorize({ module: "finance", action: "read", entitlement: "module.finance" })
  @Get("accounts")
  accounts() {
    return this.bank.accounts();
  }

  @Authorize({ module: "finance", action: "create", entitlement: "module.finance" })
  @HttpCode(201)
  @Post("accounts")
  createAccount(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Body() dto: CreateBankAccountDto) {
    return this.bank.createAccount(tenantId, userId, dto);
  }

  @Authorize({ module: "finance", action: "read", entitlement: "module.finance" })
  @Get("accounts/:id/transactions")
  transactions(@Param("id") id: string) {
    return this.bank.transactions(id);
  }

  @Authorize({ module: "finance", action: "read", entitlement: "module.finance" })
  @Get("accounts/:id/reconciliation")
  reconciliation(@Param("id") id: string) {
    return this.bank.reconciliation(id);
  }

  @Authorize({ module: "finance", action: "create", entitlement: "module.finance" })
  @HttpCode(201)
  @Post("accounts/:id/import")
  importTransactions(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Param("id") id: string, @Body() dto: ImportTransactionsDto) {
    return this.bank.importTransactions(tenantId, userId, id, dto.lines);
  }

  @Authorize({ module: "finance", action: "update", entitlement: "module.finance" })
  @HttpCode(200)
  @Post("transactions/:id/match")
  match(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Param("id") id: string, @Body() dto: MatchTransactionDto) {
    return this.bank.match(tenantId, userId, id, dto.voucherId);
  }

  @Authorize({ module: "finance", action: "update", entitlement: "module.finance" })
  @Put("transactions/:id/status")
  setStatus(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Param("id") id: string, @Body() dto: SetTxnStatusDto) {
    return this.bank.setStatus(tenantId, userId, id, dto.status);
  }
}
