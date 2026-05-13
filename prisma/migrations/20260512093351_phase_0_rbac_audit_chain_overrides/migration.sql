-- CreateEnum
CREATE TYPE "RoleAssignmentStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OverrideType" AS ENUM ('BACK_DATED_AMENDMENT', 'BACK_DATED_COVER_START', 'RATE_DEVIATION_EXCEED', 'PRE_AUTH_OVER_BENEFIT_CAP', 'CLAIM_EXCLUDED_DIAGNOSIS', 'FORCE_APPROVE_FRAUD_CLAIM', 'WAIVE_CO_CONTRIBUTION', 'EXTEND_GRACE_PERIOD', 'MID_TERM_RATE_CHANGE', 'FRAUD_RULE_THRESHOLD_ADJUSTMENT', 'RESTORE_TERMINATED_MEMBERSHIP', 'PRIVILEGE_ESCALATION', 'CUSTOM');

-- CreateEnum
CREATE TYPE "OverrideStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OverrideReasonCode" AS ENUM ('ADMINISTRATIVE_CORRECTION', 'EXCEPTIONAL_BUSINESS_CASE', 'REGULATORY_REQUIREMENT', 'CLIENT_RETENTION', 'CLINICAL_NECESSITY', 'SYSTEM_ERROR_CORRECTION', 'MANAGEMENT_INSTRUCTION', 'OTHER');

-- CreateEnum
CREATE TYPE "BlacklistReason" AS ENUM ('FRAUD_CONFIRMED', 'MISREPRESENTATION', 'TERMS_BREACH', 'COURT_ORDER', 'OTHER');

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "chainSequence" BIGSERIAL NOT NULL,
ADD COLUMN     "entityId" TEXT,
ADD COLUMN     "entityType" TEXT,
ADD COLUMN     "payloadHash" TEXT,
ADD COLUMN     "previousHash" TEXT,
ADD COLUMN     "tenantId" TEXT;

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isSystemRole" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedById" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "UserRoleAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "makerId" TEXT NOT NULL,
    "checkerId" TEXT,
    "status" "RoleAssignmentStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',

    CONSTRAINT "UserRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OverrideRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "overrideType" "OverrideType" NOT NULL,
    "makerId" TEXT NOT NULL,
    "checkerId" TEXT,
    "checker2Id" TEXT,
    "status" "OverrideStatus" NOT NULL DEFAULT 'PENDING',
    "reasonCode" "OverrideReasonCode" NOT NULL,
    "justification" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "preState" JSONB,
    "postState" JSONB,
    "slaDeadlineAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "auditEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OverrideRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternalBlacklist" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nationalId" TEXT NOT NULL,
    "memberName" TEXT NOT NULL,
    "reason" "BlacklistReason" NOT NULL,
    "narrative" TEXT,
    "addedById" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),
    "deactivatedById" TEXT,
    "relatedMemberId" TEXT,

    CONSTRAINT "InternalBlacklist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Role_tenantId_isActive_idx" ON "Role"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Role_tenantId_code_key" ON "Role"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE INDEX "UserRoleAssignment_tenantId_userId_isActive_idx" ON "UserRoleAssignment"("tenantId", "userId", "isActive");

-- CreateIndex
CREATE INDEX "UserRoleAssignment_tenantId_status_idx" ON "UserRoleAssignment"("tenantId", "status");

-- CreateIndex
CREATE INDEX "UserRoleAssignment_roleId_idx" ON "UserRoleAssignment"("roleId");

-- CreateIndex
CREATE INDEX "OverrideRecord_tenantId_status_idx" ON "OverrideRecord"("tenantId", "status");

-- CreateIndex
CREATE INDEX "OverrideRecord_tenantId_makerId_idx" ON "OverrideRecord"("tenantId", "makerId");

-- CreateIndex
CREATE INDEX "OverrideRecord_tenantId_entityType_entityId_idx" ON "OverrideRecord"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "InternalBlacklist_tenantId_isActive_idx" ON "InternalBlacklist"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "InternalBlacklist_tenantId_nationalId_isActive_idx" ON "InternalBlacklist"("tenantId", "nationalId", "isActive");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_chainSequence_idx" ON "AuditLog"("tenantId", "chainSequence");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_entityType_entityId_idx" ON "AuditLog"("tenantId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRoleAssignment" ADD CONSTRAINT "UserRoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRoleAssignment" ADD CONSTRAINT "UserRoleAssignment_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRoleAssignment" ADD CONSTRAINT "UserRoleAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OverrideRecord" ADD CONSTRAINT "OverrideRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OverrideRecord" ADD CONSTRAINT "OverrideRecord_makerId_fkey" FOREIGN KEY ("makerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OverrideRecord" ADD CONSTRAINT "OverrideRecord_checkerId_fkey" FOREIGN KEY ("checkerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalBlacklist" ADD CONSTRAINT "InternalBlacklist_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalBlacklist" ADD CONSTRAINT "InternalBlacklist_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
