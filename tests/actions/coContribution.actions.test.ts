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
    findUnique: vi.fn(),
    upsert:     vi.fn(),
  },
  package: {
    findUnique: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

vi.mock('@/lib/rbac', () => ({
  requireRole: vi.fn().mockResolvedValue({ user: { id: 'user-1', tenantId: 'tenant-1' } }),
  ROLES: { UNDERWRITING: 'UNDERWRITING' },
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
// writeAudit() reads request headers — stub to a no-header source.
vi.mock('next/headers', () => ({ headers: vi.fn(async () => ({ get: () => null })) }))

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

beforeEach(() => {
  vi.clearAllMocks()
  // Run the transaction callback with the mock client as the tx handle.
  mockPrisma.$transaction.mockImplementation(
    async (cb: (tx: typeof mockPrisma) => unknown) => cb(mockPrisma),
  )
  mockPrisma.auditLog.create.mockResolvedValue({})
  mockPrisma.annualCoContributionCap.findUnique.mockResolvedValue(null)
})

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
    // WP-2.0: message now comes from the canonical schema (richer copy).
    expect(result.error).toMatch(/fixed amount/i)
  })

  it('returns error for PERCENTAGE without percentage value', async () => {
    mockPrisma.package.findUnique.mockResolvedValue({ tenantId: 'tenant-1' })

    const result = await createCoContributionRuleAction(fd({
      packageId: 'pkg-1', networkTier: 'TIER_1', type: 'PERCENTAGE',
    }))
    // WP-2.0: message now comes from the canonical schema (richer copy).
    expect(result.error).toMatch(/percentage/i)
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

// ─── upsertAnnualCapAction — DEF-027 caps validation ──────────────────────
//
// The run-03 stop-line: a family cap BELOW the individual cap persisted with no
// validation. These assert the guarded contract — invalid input returns an
// ActionResult failure carrying field errors and writes NOTHING; valid input
// writes exactly once. Every reject-case FAILS against the pre-fix action,
// which only checked `individual <= 0`, coerced with a bare Number(), returned
// `{ error }`, and upserted unconditionally (no family>=individual rule, no
// finite/positive/2dp checks on family, no audit).

describe('upsertAnnualCapAction — DEF-027 caps validation', () => {
  const okPkg = () => mockPrisma.package.findUnique.mockResolvedValue({ tenantId: 'tenant-1' })

  it('REJECTS family cap below individual cap and writes nothing (the DEF-027 case)', async () => {
    okPkg()
    const res = await upsertAnnualCapAction(fd({
      packageId: 'pkg-1', individualCap: '300000', familyCap: '299999',
    }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.fieldErrors?.familyCap?.[0]).toMatch(/below the individual/i)
    expect(mockPrisma.annualCoContributionCap.upsert).not.toHaveBeenCalled()
  })

  it('accepts family cap equal to individual cap (300000 / 300000)', async () => {
    okPkg()
    mockPrisma.annualCoContributionCap.upsert.mockResolvedValue({})
    const res = await upsertAnnualCapAction(fd({
      packageId: 'pkg-1', individualCap: '300000', familyCap: '300000',
    }))
    expect(res.ok).toBe(true)
    const call = mockPrisma.annualCoContributionCap.upsert.mock.calls[0][0]
    expect(call.update.individualCap).toBe(300000)
    expect(call.update.familyCap).toBe(300000)
  })

  it('accepts family cap above individual cap (300000 / 600000)', async () => {
    okPkg()
    mockPrisma.annualCoContributionCap.upsert.mockResolvedValue({})
    const res = await upsertAnnualCapAction(fd({
      packageId: 'pkg-1', individualCap: '300000', familyCap: '600000',
    }))
    expect(res.ok).toBe(true)
    expect(mockPrisma.annualCoContributionCap.upsert.mock.calls[0][0].update.familyCap).toBe(600000)
  })

  it('accepts an omitted family cap (null = no family cap, D4)', async () => {
    okPkg()
    mockPrisma.annualCoContributionCap.upsert.mockResolvedValue({})
    const res = await upsertAnnualCapAction(fd({ packageId: 'pkg-1', individualCap: '300000' }))
    expect(res.ok).toBe(true)
    expect(mockPrisma.annualCoContributionCap.upsert.mock.calls[0][0].update.familyCap).toBeNull()
  })

  it('accepts a blank family cap field as null', async () => {
    okPkg()
    mockPrisma.annualCoContributionCap.upsert.mockResolvedValue({})
    const res = await upsertAnnualCapAction(fd({ packageId: 'pkg-1', individualCap: '300000', familyCap: '' }))
    expect(res.ok).toBe(true)
    expect(mockPrisma.annualCoContributionCap.upsert.mock.calls[0][0].update.familyCap).toBeNull()
  })

  it.each([
    ['zero', '0'],
    ['negative', '-5'],
    ['NaN', 'NaN'],
    ['Infinity', 'Infinity'],
    ['non-numeric string', 'abc'],
    ['fractional cents (>2dp)', '100.005'],
  ])('REJECTS individual cap = %s and writes nothing', async (_label, value) => {
    okPkg()
    const res = await upsertAnnualCapAction(fd({ packageId: 'pkg-1', individualCap: value }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.fieldErrors?.individualCap?.length).toBeGreaterThan(0)
    expect(mockPrisma.annualCoContributionCap.upsert).not.toHaveBeenCalled()
  })

  it.each([
    ['zero', '0'],
    ['negative', '-1'],
    ['NaN', 'NaN'],
    ['Infinity', 'Infinity'],
    ['non-numeric string', 'xyz'],
  ])('REJECTS family cap = %s and writes nothing', async (_label, value) => {
    okPkg()
    const res = await upsertAnnualCapAction(fd({ packageId: 'pkg-1', individualCap: '300000', familyCap: value }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.fieldErrors?.familyCap?.length).toBeGreaterThan(0)
    expect(mockPrisma.annualCoContributionCap.upsert).not.toHaveBeenCalled()
  })

  it('returns a form error (not a throw) when the package is outside the tenant', async () => {
    mockPrisma.package.findUnique.mockResolvedValue({ tenantId: 'other-tenant' })
    const res = await upsertAnnualCapAction(fd({ packageId: 'pkg-1', individualCap: '300000' }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.formError).toBe('Package not found.')
    expect(mockPrisma.annualCoContributionCap.upsert).not.toHaveBeenCalled()
  })

  it('writes a PACKAGE_CAPS_UPSERT audit event with before/after on success', async () => {
    okPkg()
    mockPrisma.annualCoContributionCap.findUnique.mockResolvedValue({ individualCap: 100000, familyCap: null })
    mockPrisma.annualCoContributionCap.upsert.mockResolvedValue({})
    const res = await upsertAnnualCapAction(fd({ packageId: 'pkg-1', individualCap: '300000', familyCap: '600000' }))
    expect(res.ok).toBe(true)
    expect(mockPrisma.auditLog.create).toHaveBeenCalledOnce()
    const audit = mockPrisma.auditLog.create.mock.calls[0][0]
    expect(audit.data.action).toBe('PACKAGE_CAPS_UPSERT')
    expect(audit.data.userId).toBe('user-1')
    expect(JSON.parse(audit.data.metadata.before)).toEqual({ individualCap: 100000, familyCap: null })
    expect(JSON.parse(audit.data.metadata.after)).toEqual({ individualCap: 300000, familyCap: 600000 })
  })
})
