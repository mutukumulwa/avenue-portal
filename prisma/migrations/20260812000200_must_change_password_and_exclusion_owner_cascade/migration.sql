-- DropForeignKey
ALTER TABLE "TreatmentExclusionRule" DROP CONSTRAINT "TreatmentExclusionRule_packageVersionId_fkey";

-- DropForeignKey
ALTER TABLE "TreatmentExclusionRule" DROP CONSTRAINT "TreatmentExclusionRule_providerContractId_fkey";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "TreatmentExclusionRule" ADD CONSTRAINT "TreatmentExclusionRule_packageVersionId_fkey" FOREIGN KEY ("packageVersionId") REFERENCES "PackageVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentExclusionRule" ADD CONSTRAINT "TreatmentExclusionRule_providerContractId_fkey" FOREIGN KEY ("providerContractId") REFERENCES "ProviderContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

