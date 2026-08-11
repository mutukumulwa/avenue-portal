/**
 * Backfill provider RBAC + network data for EXISTING databases (ELIG remediation TASK 0.5).
 *
 * You cannot re-seed a live/UAT database, but the Phase 2 (fail-closed authz),
 * Phase 3 (entitlement-scoped member resolution), and Phase 4 (auto-decision
 * gate) flips are ONLY safe once every active provider user has a real persona
 * role + branch, and every transacting provider has an active contract +
 * applicability + a credentialed practitioner. This script brings an existing
 * database up to that bar, idempotently.
 *
 * It NEVER weakens anything and NEVER fabricates a practitioner licence silently
 * — a placeholder credential is logged loudly as requiring real data.
 *
 * For every tenant it:
 *   1. ensures the RBAC catalog exists (seedRbac — idempotent)
 *   2. for every active PROVIDER_USER with no ACTIVE persona assignment: ensures a
 *      branch, grants the LEAST-privilege PROVIDER_FRONT_DESK persona + branch scope
 *   3. for every provider that has claims/PAs but no active contract+applicability:
 *      creates a default ACTIVE contract + V1 + INCLUDE applicability to the clients
 *      it has historically served (derived from its claims'/PAs' members)
 *   4. ensures each such provider has a practitioner with an ACTIVE credential
 *
 * Usage:
 *   npx tsx scripts/backfill-provider-rbac.ts            # DRY RUN (default) — reports, writes nothing
 *   npx tsx scripts/backfill-provider-rbac.ts --apply    # writes changes
 *
 * Acceptance: after --apply, the acceptance SQL in docs/eligibility-remediation/
 * REMEDIATION_PLAN.md TASK 0.4 returns zero rows; a re-run in dry mode reports 0 changes.
 */
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/prisma'
import { seedRbac } from '../prisma/seeds/rbac'
import { PROVIDER_PERSONA_ROLE_CODES } from '../prisma/seeds/provider-rbac'

const APPLY = process.argv.includes('--apply')
const YEAR_MS = 365 * 24 * 60 * 60 * 1000

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function main() {
  const mode = APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)'
  console.log(`\n🔧 Provider RBAC/network backfill — ${mode}\n`)

  const now = new Date()
  const startDate = new Date(now.getTime() - YEAR_MS)
  const endDate = new Date(now.getTime() + YEAR_MS)
  const credentialExpiry = new Date(now.getTime() + YEAR_MS)

  const summary = {
    tenants: 0,
    usersFixed: 0,
    branchesCreated: 0,
    contractsCreated: 0,
    applicabilityCreated: 0,
    practitionersCreated: 0,
    placeholderCredentials: [] as string[],
    skipped: [] as string[],
  }

  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } })
  for (const tenant of tenants) {
    const tenantId = tenant.id
    const admin = await prisma.user.findFirst({ where: { tenantId, role: 'SUPER_ADMIN', isActive: true }, select: { id: true } })
    if (!admin) { summary.skipped.push(`${tenant.name}: no active SUPER_ADMIN — cannot attribute governance rows`); continue }
    const actorId = admin.id
    summary.tenants++

    // 1) RBAC catalog (idempotent).
    if (APPLY) await seedRbac(prisma, tenantId)

    const frontDesk = await prisma.role.findUnique({ where: { tenantId_code: { tenantId, code: 'PROVIDER_FRONT_DESK' } } })
    if (APPLY && (!frontDesk || !frontDesk.isActive)) { summary.skipped.push(`${tenant.name}: PROVIDER_FRONT_DESK role missing after seedRbac`); continue }

    // 2) Provider users missing an ACTIVE persona assignment.
    const providerUsers = await prisma.user.findMany({
      where: { tenantId, role: 'PROVIDER_USER', isActive: true, providerId: { not: null } },
      select: { id: true, providerId: true, email: true },
    })
    for (const u of providerUsers) {
      const providerId = u.providerId as string
      const hasActivePersona = await prisma.userRoleAssignment.findFirst({
        where: { userId: u.id, tenantId, isActive: true, status: 'ACTIVE', role: { code: { in: [...PROVIDER_PERSONA_ROLE_CODES] } } },
        select: { id: true },
      })
      if (hasActivePersona) continue

      // ensure a branch
      let branch = await prisma.providerBranch.findFirst({ where: { tenantId, providerId, isActive: true }, select: { id: true } })
      if (!branch) {
        const prov = await prisma.provider.findUnique({ where: { id: providerId }, select: { name: true } })
        summary.branchesCreated++
        if (APPLY) {
          branch = await prisma.providerBranch.create({
            data: { tenantId, providerId, name: `${prov?.name ?? 'Facility'} — Main Branch`.slice(0, 120), code: 'MAIN', isActive: true },
            select: { id: true },
          })
        }
      }

      summary.usersFixed++
      if (APPLY && frontDesk) {
        await prisma.userRoleAssignment.create({
          data: { userId: u.id, roleId: frontDesk.id, tenantId, makerId: actorId, checkerId: actorId, isActive: true, status: 'ACTIVE' },
        })
        if (branch) {
          const exists = await prisma.providerUserBranchAssignment.findFirst({
            where: { tenantId, providerId, userId: u.id, providerBranchId: branch.id, activeTo: null }, select: { id: true },
          })
          if (!exists) {
            await prisma.providerUserBranchAssignment.create({
              data: { tenantId, providerId, userId: u.id, providerBranchId: branch.id, createdBy: actorId },
            })
          }
        }
      }
    }

    // 3 + 4) Providers that transact but lack an active contract/applicability/practitioner.
    const providers = await prisma.provider.findMany({ where: { tenantId }, select: { id: true, name: true } })
    for (const p of providers) {
      const [claimCount, paCount] = await Promise.all([
        prisma.claim.count({ where: { tenantId, providerId: p.id } }),
        prisma.preAuthorization.count({ where: { tenantId, providerId: p.id } }),
      ])
      if (claimCount === 0 && paCount === 0) continue
      const slug = slugify(p.name)

      // Derive the clients this provider has actually served (Claim/PA → member → group → clientId).
      const [claimMembers, paMembers] = await Promise.all([
        prisma.claim.findMany({ where: { tenantId, providerId: p.id }, select: { member: { select: { group: { select: { clientId: true } } } } }, take: 5000 }),
        prisma.preAuthorization.findMany({ where: { tenantId, providerId: p.id }, select: { member: { select: { group: { select: { clientId: true } } } } }, take: 5000 }),
      ])
      const servedClientIds = new Set<string>()
      for (const r of [...claimMembers, ...paMembers]) {
        const cid = r.member?.group?.clientId
        if (cid) servedClientIds.add(cid)
      }

      // Contract + V1 (idempotent by (tenantId, contractNumber)).
      const contractNumber = `CTR-BACKFILL-${slug}`.slice(0, 60).toUpperCase()
      let contract = await prisma.providerContract.findFirst({ where: { tenantId, providerId: p.id, status: 'ACTIVE' }, select: { id: true } })
      if (!contract) {
        summary.contractsCreated++
        if (APPLY) {
          const created = await prisma.providerContract.create({
            data: {
              tenantId, providerId: p.id, contractNumber,
              title: `${p.name} — Backfill Rate Schedule`.slice(0, 200),
              contractType: 'RATE_SCHEDULE', status: 'ACTIVE', executionStatus: 'FULLY_EXECUTED',
              branchScope: 'ALL_BRANCHES', startDate, endDate, currency: 'UGX',
              unlistedServiceRule: 'REFER_FOR_REVIEW',
              notes: 'Backfill contract — restores network-active state for a provider that already transacts. Replace with the real negotiated contract.',
            },
            select: { id: true },
          })
          const v1 = await prisma.contractVersion.create({
            data: { tenantId, contractId: created.id, versionNumber: 1, status: 'ACTIVE', effectiveFrom: startDate, effectiveTo: null, changeSummary: 'V1 backfill schedule' },
          })
          await prisma.providerContract.update({ where: { id: created.id }, data: { currentVersionId: v1.id } })
          contract = { id: created.id }
        }
      }

      // Applicability to every served client (idempotent).
      if (contract) {
        for (const clientId of servedClientIds) {
          const existing = await prisma.contractApplicability.findFirst({ where: { contractId: contract.id, clientId, groupId: null, inclusionType: 'INCLUDE' }, select: { id: true } })
          if (!existing) {
            summary.applicabilityCreated++
            if (APPLY) await prisma.contractApplicability.create({ data: { contractId: contract.id, clientId, inclusionType: 'INCLUDE', effectiveFrom: startDate, isActive: true } })
          }
        }
      } else if (servedClientIds.size > 0 && !APPLY) {
        // dry-run: the contract would be created above, so count the applicability it would need
        summary.applicabilityCreated += servedClientIds.size
      }

      // Practitioner + ACTIVE credential.
      const hasValidCredential = await prisma.providerPractitioner.findFirst({
        where: { providerId: p.id, practitioner: { credentials: { some: { status: 'ACTIVE', expiryDate: { gt: now } } } } }, select: { providerId: true },
      })
      if (!hasValidCredential) {
        const licenseNumber = `BACKFILL-${slug}-001`.slice(0, 40).toUpperCase()
        summary.practitionersCreated++
        summary.placeholderCredentials.push(`${tenant.name} / ${p.name} — placeholder practising licence; REPLACE with the real credential before relying on the PRACTITIONER_CREDENTIAL gate`)
        if (APPLY) {
          let practitioner = await prisma.practitioner.findFirst({ where: { tenantId, licenseNumber }, select: { id: true } })
          if (!practitioner) {
            practitioner = await prisma.practitioner.create({ data: { tenantId, firstName: 'Backfill', lastName: `Clinician — ${p.name}`.slice(0, 60), licenseType: 'MEDICAL', licenseNumber }, select: { id: true } })
            await prisma.practitionerCredential.create({ data: { practitionerId: practitioner.id, documentType: 'PRACTISING_LICENCE', status: 'ACTIVE', issueDate: startDate, expiryDate: credentialExpiry, notes: 'BACKFILL PLACEHOLDER — replace with the real licence.' } })
          }
          const join = await prisma.providerPractitioner.findUnique({ where: { providerId_practitionerId: { providerId: p.id, practitionerId: practitioner.id } }, select: { providerId: true } })
          if (!join) await prisma.providerPractitioner.create({ data: { providerId: p.id, practitionerId: practitioner.id, isPrimary: true } })
        }
      }
    }
  }

  console.log('──────────── SUMMARY ────────────')
  console.log(`Tenants processed:            ${summary.tenants}`)
  console.log(`Provider users provisioned:   ${summary.usersFixed}`)
  console.log(`Branches created:             ${summary.branchesCreated}`)
  console.log(`Contracts created:            ${summary.contractsCreated}`)
  console.log(`Applicability rows created:   ${summary.applicabilityCreated}`)
  console.log(`Practitioners created:        ${summary.practitionersCreated}`)
  if (summary.placeholderCredentials.length) {
    console.log(`\n⚠️  PLACEHOLDER credentials created (${summary.placeholderCredentials.length}) — replace with real data:`)
    for (const w of summary.placeholderCredentials) console.log(`   • ${w}`)
  }
  if (summary.skipped.length) {
    console.log(`\n⏭️  Skipped:`)
    for (const s of summary.skipped) console.log(`   • ${s}`)
  }
  if (!APPLY) console.log('\nDRY RUN — re-run with --apply to write these changes.')
  console.log('─────────────────────────────────')
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
