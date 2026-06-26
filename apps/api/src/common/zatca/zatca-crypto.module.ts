import { Global, Module } from "@nestjs/common";
import { CryptoVaultService } from "../crypto/crypto-vault.service";
import { ZatcaCryptoService } from "./zatca-crypto.service";

/** خدمات التشفير الأساسية (تشفير at-rest + ZATCA) — عامّة لكل الوحدات. */
@Global()
@Module({
  providers: [CryptoVaultService, ZatcaCryptoService],
  exports: [CryptoVaultService, ZatcaCryptoService],
})
export class ZatcaCryptoModule {}
