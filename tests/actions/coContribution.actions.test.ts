import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────
const mockPrisma = vi.hoisted(() => ({
  coContributionRule: {
    findUnique: vi.fn(),
    create:     vi.fn(),
    update:     vi.fn(),
    delete:     vi.fn(),
  },
  annualCoContributionCap: {
    upsert: vi.fn(),
  },
  package: {
    findUnique: vi.fn(),
  },
}))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

vi.mock('@/lib/rbac', () => ({
  requireRole: vi.fn().mockResolvedValue({ user: { id: 'user-1', tenantId: 'tenant-1' } }),
  ROLES: { UNDERWRITING: 'UNDERWRITING' },
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import {
  createCoContributionRuleAction,
  toggleCoContributionRuleAction,
  deleteCoContributionRuleAction,
  upsertAnnualCapAction,
} from '@/app/(admin)/packages/[id]/coContribution.actions'

function fd(entries: Record<string, string>): FormData {
  const f = new FormData()
  Object.entries(entries).forEach(([k, v]) => f.set(k, v))
  return f
}

beforeEach(() => vi.clearAllMocks())

// ─── createCoContributionRuleAction ───────────────────────────────────────

describe('createCoContributionRuleAction', () => {
  it('returns error when package not found for tenant', async () => {
    mockPrisma.package.findUnique.mockResolvedValue(null)

    const result = await createCoContributionRuleAction(fd({
      packageId: 'pkg-x', networkTier: 'TIER_1', type: 'PERCENTAGE', percentage: '20',
    }))
    expect(result.error).toBe('Package not found.')
    expect(mockPrisma.coContributionRule.create).not.toHaveBeenCalled()
  })

  it('returns error when package belongs to different tenant', async () => {
    mockPrisma.package.findUnique.mockResolvedValue({ tenantId: 'other-tenant' })

    const result = await createCoContributionRuleAction(fd({
      packageId: 'pkg-1', networkTier: 'TIER_1', type: 'PERCENTAGE', percentage: '20',
    }))
    expect(result.error).toBe('Package not found.')
  })

  it('returns error for FIXED_AMOUNT without a fixed amount value', async () => {
    mockPrisma.package.findUnique.mockResolvedValue({ tenantId: 'tenant-1' })

    const result = await createCoContributionRuleAction(fd({
      packageId: 'pkg-1', networkTier: 'TIER_1', type: 'FIXED_AMOUNT',
    }))
    expect(result.error).toBe('Fixed amount required.')
  })

  it('returns error for PERCENTAGE without percentage value', async () => {
    mockPrisma.package.findUnique.mockResolvedValue({ tenantId: 'tenant-1' })

    const result = await createCoContributionRuleAction(fd({
      packageId: 'pkg-1', networkTier: 'TIER_1', type: 'PERCENTAGE',
    }))
    expect(result.error).toBe('Percentage required.')
  })

  it('creates rule and returns empty object on success', async () => {
    mockPrisma.package.findUnique.mockResolvedValue({ tenantId: 'tenant-1' })
    mockPrisma.coContributionRule.create.mockResolvedValue({ id: 'r-new' })

    const result = await createCoContributionRuleAction(fd({
      packageId: 'pkg-1', networkTier: 'TIER_2', type: 'PERCENTAGE', percentage: '15',
    }))
    expect(result.error).toBeUndefined()
    expect(mockPrisma.coContributionRule.create).toHaveBeenCalledOnce()
    const createCall = mockPrisma.coContributionRule.create.mock.calls[0][0]
    expect(createCall.data.networkTier).toBe('TIER_2')
    expect(createCall.data.percentage).toBe(15)
  })

  it('creates a NONE rule without requiring amount or percentage', async () => {
    mockPrisma.package.findUnique.mockResolvedValue({ tenantId: 'tenant-1' })
    mockPrisma.coContributionRule.create.mockResolvedValue({ id: 'r-none' })

    const result = await createCoContributionRuleAction(fd({
      packageId: 'pkg-1', networkTier: 'TIER_1', type: 'NONE',
    }))
    expect(result.error).toBeUndefined()
  })
})

// ─── toggleCoContributionRuleAction ───────────────────────────────────────

describe('toggleCoContributionRuleAction', () => {
  it('returns error when rule not found for tenant', async () => {
    mockPrisma.coContributionRule.findUnique.mockResolvedValue(null)

    const result = await toggleCoContributionRuleAction(fd({ ruleId: 'r-1', packageId: 'pkg-1' }))
    expect(result.error).toBe('Rule not found.')
  })

  it('toggles isActive from true to false', async () => {
    mockPrisma.coContributionRule.findUnique.mockResolvedValue({ tenantId: 'tenant-1', isActive: true })
    mockPrisma.coContributionRule.update.mockResolvedValue({})

    await toggleCoContributionRuleAction(fd({ ruleId: 'r-1', packageId: 'pkg-1' }))
    expect(mockPrisma.coContributionRule.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } })
    )
  })

  it('toggles isActive from false to true', async () => {
    mockPrisma.coContributionRule.findUnique.mockResolvedValue({ tenantId: 'tenant-1', isActive: false })
    mockPrisma.coContributionRule.update.mockResolvedValue({})

    await toggleCoContributionRuleAction(fd({ ruleId: 'r-1', packageId: 'pkg-1' }))
    expect(mockPrisma.coContributionRule.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: true } })
    )
  })
})

// ─── deleteCoContributionRuleAction ───────────────────────────────────────

describe('deleteCoContributionRuleAction', () => {
  it('returns error when rule not found', async () => {
    mockPrisma.coContributionRule.findUnique.mockResolvedValue(null)

    const result = await deleteCoContributionRuleAction(fd({ ruleId: 'r-x', packageId: 'pkg-1' }))
    expect(result.error).toBe('Rule not found.')
    expect(mockPrisma.coContributionRule.delete).not.toHaveBeenCalled()
  })

  it('deletes the rule when found for the correct tenant', async () => {
    mockPrisma.coContributionRule.findUnique.mockResolvedValue({ tenantId: 'tenant-1' })
    mockPrisma.coContributionRule.delete.mockResolvedValue({})

    const result = await deleteCoContributionRuleAction(fd({ ruleId: 'r-1', packageId: 'pkg-1' }))
    expect(result.error).toBeUndefined()
    expect(mockPrisma.coContributionRule.delete).toHaveBeenCalledWith({ where: { id: 'r-1' } })
  })
})

// ─── upsertAnnualCapAction ────────────────────────────────────────────────

describe('upsertAnnualCapAction', () => {
  it('returns error when individual cap is missing', async () => {
    mockPrisma.package.findUnique.mockResolvedValue({ tenantId: 'tenant-1' })

    const result = await upsertAnnualCapAction(fd({ packageId: 'pkg-1', individualCap: '0' }))
    expect(result.error).toBeTruthy()
  })

  it('upserts cap with individual only (no family)', async () => {
    mockPrisma.package.findUnique.mockResolvedValue({ tenantId: 'tenant-1' })
    mockPrisma.annualCoContributionCap.upsert.mockResolvedValue({})

    const result = await upsertAnnualCapAction(fd({
      packageId: 'pkg-1', individualCap: '10000',
    }))
    expect(result.error).toBeUndefined()
    const call = mockPrisma.annualCoContributionCap.upsert.mock.calls[0][0]
    expect(call.update.individualCap).toBe(10000)
    expect(call.update.familyCap).toBeNull()
  })

  it('upserts cap with both individual and family', async () => {
    mockPrisma.package.findUnique.mockResolvedValue({ tenantId: 'tenant-1' })
    mockPrisma.annualCoContributionCap.upsert.mockResolvedValue({})

    await upsertAnnualCapAction(fd({
      packageId: 'pkg-1', individualCap: '10000', familyCap: '25000',
    }))
    const call = mockPrisma.annualCoContributionCap.upsert.mock.calls[0][0]
    expect(call.update.familyCap).toBe(25000)
  })
})
