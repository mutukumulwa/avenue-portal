import bcrypt from 'bcryptjs'
import type { PrismaClient } from '@prisma/client'

/**
 * Provider-network seed — the data a correctly-run TPA would already hold.
 *
 * ELIG remediation Phase 0 / TASK 0.4. Before this, `prisma/seed.ts` created 6
 * `Provider` rows but ZERO branches, contracts, applicability, practitioners, or
 * provider users. That emptiness is exactly what let the UAT create a
 * zero-permission provider user with a full portal (ELIG-GAP-004), file claims
 * for un-entitled members (020), and auto-approve PAs whose PROVIDER_NETWORK /
 * PRACTITIONER_CREDENTIAL gates passed on ABSENT data (021). Seeding the network
 * layer here makes those gates pass on REAL facts and lets the Phase 2/3/4
 * fail-closed flips land without bricking any provider.
 *
 * For EACH provider in the tenant this creates, idempotently:
 *   1. a primary `ProviderBranch`
 *   2. an ACTIVE `ProviderContract` + V1 `ContractVersion` (currentVersionId set), UGX
 *   3. one INCLUDE `ContractApplicability` per active client (so seeded members resolve)
 *   4. a `Practitioner` + ACTIVE `PractitionerCredential` linked via `ProviderPractitioner`
 *   5. one provider `User` per persona below, each with an ACTIVE persona
 *      `UserRoleAssignment` + a `ProviderUserBranchAssignment`
 *
 * MUST run AFTER `TenantProvisioningService.provisionTenant(tenantId)` (roles +
 * permissions must exist) and after the tenant's clients, providers, and the
 * bootstrap SUPER_ADMIN user exist. Structure mirrors the proven reference
 * scripts `scripts/uat-contract-book.ts` and `scripts/uat/provision-live-uat-users.ts`.
 */

// Least set of personas that makes a facility fully operable. Codes MUST be in
// PROVIDER_PERSONA_ROLE_CODES (prisma/seeds/provider-rbac.ts) — never PROVIDER_LEGACY.
const SEED_PERSONAS = [
  { code: 'PROVIDER_ADMIN', first: 'Facility', last: 'Admin', slug: 'admin' },
  { code: 'PROVIDER_FRONT_DESK', first: 'Front', last: 'Desk', slug: 'frontdesk' },
  { code: 'PROVIDER_BILLER', first: 'Facility', last: 'Biller', slug: 'biller' },
] as const

const YEAR_MS = 365 * 24 * 60 * 60 * 1000

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export interface ProviderNetworkSeedResult {
  providers: number
  branchesCreated: number
  contractsCreated: number
  applicabilityCreated: number
  practitionersCreated: number
  usersProvisioned: number
}

export async function seedProviderNetwork(prisma: PrismaClient, tenantId: string): Promise<ProviderNetworkSeedResult> {
  const password = process.env.SEED_PASSWORD || 'Mdx!Seed-2026#Rotate'
  const passwordHash = await bcrypt.hash(password, 12)

  // maker / checker / createdBy for every governance row — the tenant's bootstrap admin.
  const bootstrap = await prisma.user.findFirst({ where: { tenantId, role: 'SUPER_ADMIN' }, select: { id: true } })
  if (!bootstrap) throw new Error('seedProviderNetwork: no SUPER_ADMIN user found — run after the user seed')
  const bootstrapUserId = bootstrap.id

  // Clients this network serves. INCLUDE applicability for every active client so
  // any seeded member is entitled at any seeded provider (all six are own/panel).
  const clients = await prisma.client.findMany({
    where: { operatorTenantId: tenantId, isActive: true, status: 'ACTIVE' },
    select: { id: true },
  })
  if (clients.length === 0) throw new Error('seedProviderNetwork: no active clients — run after client seed / provisionTenant')

  const providers = await prisma.provider.findMany({ where: { tenantId }, select: { id: true, name: true } })

  const now = new Date()
  const startDate = new Date(now.getTime() - YEAR_MS)
  const endDate = new Date(now.getTime() + YEAR_MS)
  const credentialExpiry = new Date(now.getTime() + YEAR_MS)

  const result: ProviderNetworkSeedResult = {
    providers: providers.length,
    branchesCreated: 0,
    contractsCreated: 0,
    applicabilityCreated: 0,
    practitionersCreated: 0,
    usersProvisioned: 0,
  }

  for (const provider of providers) {
    const slug = slugify(provider.name)

    // 1) Primary branch (idempotent by (providerId, code) — no DB unique, so check first).
    const branchCode = `${slug}-MAIN`.slice(0, 40).toUpperCase()
    let branch = await prisma.providerBranch.findFirst({ where: { tenantId, providerId: provider.id, code: branchCode } })
    if (!branch) {
      branch = await prisma.providerBranch.create({
        data: { tenantId, providerId: provider.id, name: `${provider.name} — Main Branch`.slice(0, 120), code: branchCode, isActive: true },
      })
      result.branchesCreated++
    }

    // 2) ACTIVE contract + V1 (currency UGX — the model default is KES).
    const contractNumber = `CTR-SEED-${slug}`.slice(0, 60).toUpperCase()
    let contract = await prisma.providerContract.findFirst({ where: { tenantId, contractNumber } })
    if (!contract) {
      contract = await prisma.providerContract.create({
        data: {
          tenantId, providerId: provider.id, contractNumber,
          title: `${provider.name} — Seed Rate Schedule`.slice(0, 200),
          contractType: 'RATE_SCHEDULE', status: 'ACTIVE', executionStatus: 'FULLY_EXECUTED',
          branchScope: 'ALL_BRANCHES', startDate, endDate, currency: 'UGX',
          unlistedServiceRule: 'REFER_FOR_REVIEW',
          notes: 'Seed contract — makes the facility network-active for eligibility, claims, and pre-authorisation.',
        },
      })
      const v1 = await prisma.contractVersion.create({
        data: {
          tenantId, contractId: contract.id, versionNumber: 1, status: 'ACTIVE',
          effectiveFrom: startDate, effectiveTo: null, changeSummary: 'V1 seed schedule',
        },
      })
      await prisma.providerContract.update({ where: { id: contract.id }, data: { currentVersionId: v1.id } })
      result.contractsCreated++
    }

    // 3) INCLUDE applicability — one row per active client (idempotent).
    for (const client of clients) {
      const existing = await prisma.contractApplicability.findFirst({
        where: { contractId: contract.id, clientId: client.id, groupId: null, inclusionType: 'INCLUDE' },
      })
      if (!existing) {
        await prisma.contractApplicability.create({
          data: { contractId: contract.id, clientId: client.id, inclusionType: 'INCLUDE', effectiveFrom: startDate, isActive: true },
        })
        result.applicabilityCreated++
      }
    }

    // 4) Practitioner + ACTIVE credential + join (idempotent by (tenantId, licenseNumber)).
    const licenseNumber = `SEED-${slug}-001`.slice(0, 40).toUpperCase()
    let practitioner = await prisma.practitioner.findFirst({ where: { tenantId, licenseNumber } })
    if (!practitioner) {
      practitioner = await prisma.practitioner.create({
        data: { tenantId, firstName: 'Seed', lastName: `Clinician — ${provider.name}`.slice(0, 60), licenseType: 'MEDICAL', licenseNumber },
      })
      await prisma.practitionerCredential.create({
        data: { practitionerId: practitioner.id, documentType: 'PRACTISING_LICENCE', status: 'ACTIVE', issueDate: startDate, expiryDate: credentialExpiry },
      })
      result.practitionersCreated++
    }
    const joinExists = await prisma.providerPractitioner.findUnique({
      where: { providerId_practitionerId: { providerId: provider.id, practitionerId: practitioner.id } },
    })
    if (!joinExists) {
      await prisma.providerPractitioner.create({ data: { providerId: provider.id, practitionerId: practitioner.id, isPrimary: true } })
    }

    // 5) Provider users — one per persona, each with an ACTIVE role assignment + branch scope.
    for (const persona of SEED_PERSONAS) {
      const role = await prisma.role.findUnique({ where: { tenantId_code: { tenantId, code: persona.code } } })
      if (!role || !role.isActive) throw new Error(`seedProviderNetwork: role ${persona.code} missing/inactive — run provisionTenant first`)

      const email = `${persona.slug}.${slug}@seed.medvex.co.ug`.replace(/-+/g, '-')
      const user = await prisma.user.upsert({
        where: { tenantId_email: { tenantId, email } },
        update: { providerId: provider.id, isActive: true },
        create: {
          tenantId, email, passwordHash,
          firstName: persona.first, lastName: `${persona.last} — ${provider.name}`.slice(0, 60),
          role: 'PROVIDER_USER', providerId: provider.id, isActive: true,
        },
      })

      // Persona role assignment — status MUST be ACTIVE (default PENDING_APPROVAL grants nothing).
      const existingAssignment = await prisma.userRoleAssignment.findFirst({
        where: { userId: user.id, roleId: role.id, tenantId, isActive: true, status: 'ACTIVE' },
      })
      if (!existingAssignment) {
        await prisma.userRoleAssignment.create({
          data: { userId: user.id, roleId: role.id, tenantId, makerId: bootstrapUserId, checkerId: bootstrapUserId, isActive: true, status: 'ACTIVE' },
        })
      }

      // Branch scope — an empty scope denies branch-scoped resources (F1.3).
      const existingBranch = await prisma.providerUserBranchAssignment.findFirst({
        where: { tenantId, providerId: provider.id, userId: user.id, providerBranchId: branch.id, activeTo: null },
      })
      if (!existingBranch) {
        await prisma.providerUserBranchAssignment.create({
          data: { tenantId, providerId: provider.id, userId: user.id, providerBranchId: branch.id, createdBy: bootstrapUserId },
        })
      }
      result.usersProvisioned++
    }
  }

  return result
}
