-- Family Hospital UAT plan P02.04 — ClaimLine.selectedProviderTariffId.
--
-- Capture provenance: the provider tariff row a facility selected when it
-- captured a claim line, re-read on the server at submit. It is deliberately a
-- separate column from "matchedRuleId", which the contract engine owns as its
-- adjudication outcome; the contracted rate captured from the selected row
-- goes in the existing "tariffRate" snapshot.
--
-- Additive: a nullable column with no default (a catalogue-only change in
-- Postgres), an index, and a foreign key that every existing row satisfies
-- because the column is null. ON DELETE RESTRICT matches the rule that tariff
-- rows are never deleted, only deactivated. Sized against production on
-- 2026-09-11: 64 ClaimLine rows (280 kB), so the index build is immediate.
--
-- Generated with `prisma migrate diff --from-config-datasource --to-schema`
-- against a database carrying every earlier migration: this is the whole diff.

-- AlterTable
ALTER TABLE "ClaimLine" ADD COLUMN     "selectedProviderTariffId" TEXT;

-- CreateIndex
CREATE INDEX "ClaimLine_selectedProviderTariffId_idx" ON "ClaimLine"("selectedProviderTariffId");

-- AddForeignKey
ALTER TABLE "ClaimLine" ADD CONSTRAINT "ClaimLine_selectedProviderTariffId_fkey" FOREIGN KEY ("selectedProviderTariffId") REFERENCES "ProviderTariff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
