import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock Prisma before importing the service ──────────────────────────────
const mockPrisma = vi.hoisted(() => ({
  coContributionTransaction: {
    count: vi.fn(),
    findUnique: vi.fn(),
  },
  claim: {
    findUnique: vi.fn(),
  },
  memberAnnualCoContribution: {
    findFirst: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { FraudService } from '@/server/services/fraud.service'

const BASE_PARAMS = {
  claimId: 'claim-1',
  tenantId: 'tenant-1',
  memberId: 'member-1',
  finalAmount: 500,
  collectionStatus: 'PENDING',
  waiverReason: null,
  waiverApprovedBy: null,
}

beforeEach(() => vi.clearAllMocks())

// ─── RULE-COC-001: Waiver without documented reason ────────────────────────

describe('RULE-COC-001 — waiver without reason', () => {
  it('flags waiver with no reason', async () => {
    mockPrisma.coContributionTransaction.count.mockResolvedValue(0)
    mockPrisma.coContributionTransaction.findUnique.mockResolvedValue(null)
    mockPrisma.claim.findUnique.mockResolvedValue(null)
    mockPrisma.memberAnnualCoContribution.findFirst.mockResolvedValue(null)

    const warnings = await FraudService.evaluateCoContribution({
      ...BASE_PARAMS,
      collectionStatus: 'WAIVED',
      waiverReason: '',
    })
    expect(warnings.some(w => w.includes('RULE-COC-001'))).toBe(true)
  })

  it('flags waiver with reason shorter than 10 chars', async () => {
    mockPrisma.coContributionTransaction.count.mockResolvedValue(0)
    mockPrisma.coContributionTransaction.findUnique.mockResolvedValue(null)
    mockPrisma.claim.findUnique.mockResolvedValue(null)
    mockPrisma.memberAnnualCoContribution.findFirst.mockResolvedValue(null)

    const warnings = await FraudService.evaluateCoContribution({
      ...BASE_PARAMS,
      collectionStatus: 'WAIVED',
      waiverReason: 'short',
    })
    expect(warnings.some(w => w.includes('RULE-COC-001'))).toBe(true)
  })

  it('does not flag waiver with adequate reason', async () => {
    mockPrisma.coContributionTransaction.count.mockResolvedValue(0)
    mockPrisma.coContributionTransaction.findUnique.mockResolvedValue(null)
    mockPrisma.claim.findUnique.mockResolvedValue(null)
    mockPrisma.memberAnnualCoContribution.findFirst.mockResolvedValue(null)

    const warnings = await FraudService.evaluateCoContribution({
      ...BASE_PARAMS,
      collectionStatus: 'WAIVED',
      waiverReason: 'Member is a senior citizen with financial hardship.',
    })
    expect(warnings.some(w => w.includes('RULE-COC-001'))).toBe(false)
  })
})

// ─── RULE-COC-002: Repeated waivers ───────────────────────────────────────

describe('RULE-COC-002 — repeated waivers', () => {
  it('flags when member has 2 or more prior waivers in 90 days', async () => {
    mockPrisma.coContributionTransaction.count.mockResolvedValue(2)
    mockPrisma.coContributionTransaction.findUnique.mockResolvedValue(null)
    mockPrisma.claim.findUnique.mockResolvedValue(null)
    mockPrisma.memberAnnualCoContribution.findFirst.mockResolvedValue(null)

    const warnings = await FraudService.evaluateCoContribution(BASE_PARAMS)
    expect(warnings.some(w => w.includes('RULE-COC-002'))).toBe(true)
  })

  it('does not flag when member has 1 prior waiver', async () => {
    mockPrisma.coContributionTransaction.count.mockResolvedValue(1)
    mockPrisma.coContributionTransaction.findUnique.mockResolvedValue(null)
    mockPrisma.claim.findUnique.mockResolvedValue(null)
    mockPrisma.memberAnnualCoContribution.findFirst.mockResolvedValue(null)

    const warnings = await FraudService.evaluateCoContribution(BASE_PARAMS)
    expect(warnings.some(w => w.includes('RULE-COC-002'))).toBe(false)
  })
})

// ─── RULE-COC-003: Collected exceeds final amount ─────────────────────────

describe('RULE-COC-003 — overcharge detection', () => {
  it('flags when amount collected is more than 1% above final amount', async () => {
    mockPrisma.coContributionTransaction.count.mockResolvedValue(0)
    mockPrisma.coContributionTransaction.findUnique.mockResolvedValue({
      finalAmount: '500.00',
      amountCollected: '600.00', // 20% over
    })
    mockPrisma.claim.findUnique.mockResolvedValue(null)
    mockPrisma.memberAnnualCoContribution.findFirst.mockResolvedValue(null)

    const warnings = await FraudService.evaluateCoContribution(BASE_PARAMS)
    expect(warnings.some(w => w.includes('RULE-COC-003'))).toBe(true)
  })

  it('does not flag when collected equals final amount', async () => {
    mockPrisma.coContributionTransaction.count.mockResolvedValue(0)
    mockPrisma.coContributionTransaction.findUnique.mockResolvedValue({
      finalAmount: '500.00',
      amountCollected: '500.00',
    })
    mockPrisma.claim.findUnique.mockResolvedValue(null)
    mockPrisma.memberAnnualCoContribution.findFirst.mockResolvedValue(null)

    const warnings = await FraudService.evaluateCoContribution(BASE_PARAMS)
    expect(warnings.some(w => w.includes('RULE-COC-003'))).toBe(false)
  })
})

// ─── RULE-COC-004: Zero co-contribution on high-value claim ───────────────

describe('RULE-COC-004 — zero co-contrib on high-value claim', () => {
  it('flags zero final amount on a claim over KES 50,000', async () => {
    mockPrisma.coContributionTransaction.count.mockResolvedValue(0)
    mockPrisma.coContributionTransaction.findUnique.mockResolvedValue(null)
    mockPrisma.claim.findUnique.mockResolvedValue({ billedAmount: '80000.00' })
    mockPrisma.memberAnnualCoContribution.findFirst.mockResolvedValue(null)

    const warnings = await FraudService.evaluateCoContribution({
      ...BASE_PARAMS,
      finalAmount: 0,
    })
    expect(warnings.some(w => w.includes('RULE-COC-004'))).toBe(true)
  })

  it('does not flag zero amount on a low-value claim', async () => {
    mockPrisma.coContributionTransaction.count.mockResolvedValue(0)
    mockPrisma.coContributionTransaction.findUnique.mockResolvedValue(null)
    mockPrisma.claim.findUnique.mockResolvedValue({ billedAmount: '3000.00' })
    mockPrisma.memberAnnualCoContribution.findFirst.mockResolvedValue(null)

    const warnings = await FraudService.evaluateCoContribution({
      ...BASE_PARAMS,
      finalAmount: 0,
    })
    expect(warnings.some(w => w.includes('RULE-COC-004'))).toBe(false)
  })

  it('does not flag zero amount when status is WAIVED', async () => {
    mockPrisma.coContributionTransaction.count.mockResolvedValue(0)
    mockPrisma.coContributionTransaction.findUnique.mockResolvedValue(null)
    // claim query is skipped for WAIVED status
    mockPrisma.claim.findUnique.mockResolvedValue(null)
    mockPrisma.memberAnnualCoContribution.findFirst.mockResolvedValue(null)

    const warnings = await FraudService.evaluateCoContribution({
      ...BASE_PARAMS,
      finalAmount: 0,
      collectionStatus: 'WAIVED',
      waiverReason: 'This is a sufficiently long waiver reason.',
    })
    expect(warnings.some(w => w.includes('RULE-COC-004'))).toBe(false)
  })
})

// ─── RULE-COC-005: Annual cap reached early ───────────────────────────────

describe('RULE-COC-005 — cap reached before Q3', () => {
  it('flags when member annual cap is reached before Q3', async () => {
    mockPrisma.coContributionTransaction.count.mockResolvedValue(0)
    mockPrisma.coContributionTransaction.findUnique.mockResolvedValue(null)
    mockPrisma.claim.findUnique.mockResolvedValue(null)
    mockPrisma.memberAnnualCoContribution.findFirst.mockResolvedValue({
      id: 'acc-1', capReached: true,
    })

    const warnings = await FraudService.evaluateCoContribution(BASE_PARAMS)
    expect(warnings.some(w => w.includes('RULE-COC-005'))).toBe(true)
  })

  it('does not flag when cap has not been reached', async () => {
    mockPrisma.coContributionTransaction.count.mockResolvedValue(0)
    mockPrisma.coContributionTransaction.findUnique.mockResolvedValue(null)
    mockPrisma.claim.findUnique.mockResolvedValue(null)
    mockPrisma.memberAnnualCoContribution.findFirst.mockResolvedValue(null)

    const warnings = await FraudService.evaluateCoContribution(BASE_PARAMS)
    expect(warnings.some(w => w.includes('RULE-COC-005'))).toBe(false)
  })
})
