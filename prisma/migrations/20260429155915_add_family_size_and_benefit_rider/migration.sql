-- CreateEnum
CREATE TYPE "FamilySize" AS ENUM ('M', 'M_1', 'M_2', 'M_3', 'M_4', 'M_5', 'M_6', 'M_7', 'M_7_PLUS');

-- CreateTable
CREATE TABLE "BenefitRider" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BenefitRider_pkey" PRIMARY KEY ("code")
);
