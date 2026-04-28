import { describe, it, expect } from 'vitest'
import Decimal from 'decimal.js'
import { calculateCoContribution } from '@/server/services/coContribution/calculator'
import type { CoContributionRule } from '@prisma/client'

// Minimal rule factory — only fields calculator uses
type RuleOverrides = Partial<Omit<CoContributionRule, 'fixedAmount' | 'percentage' | 'perVisitCap' | 'perEncounterCap'>> & {
  fixedAmount?: Decimal | number | null
  percentage?: Decimal | number | null
  perVisitCap?: Decimal | number | null
  perEncounterCap?: Decimal | number | null
}

function decimalOrNull(value: Decimal | number | null | undefined): Decimal | null {
  if (value === undefined || value === null) return null
  return new Decimal(value)
}

function rule(overrides: RuleOverrides): CoContributionRule {
  return {
    id: 'rule-1', tenantId: 't1', packageId: 'pkg-1',
    benefitCategory: null, networkTier: 'TIER_1',
    type: 'PERCENTAGE',
    effectiveFrom: new Date(), effectiveTo: null, isActive: true,
    createdBy: null, updatedBy: null,
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
    fixedAmount: decimalOrNull(overrides.fixedAmount),
    percentage: decimalOrNull(overrides.percentage),
    perVisitCap: decimalOrNull(overrides.perVisitCap),
    perEncounterCap: decimalOrNull(overrides.perEncounterCap),
  } as CoContributionRule
}

const zero = new Decimal(0)

// ─── PERCENTAGE ────────────────────────────────────────────────────────────

describe('PERCENTAGE rule', () => {
  it('calculates 20% of service cost', () => {
    const result = calculateCoContribution({
      rule: rule({ type: 'PERCENTAGE', percentage: 20 }),
      serviceCost: new Decimal(10000),
      memberYtdTotal: zero,
      familyYtdTotal: zero,
      individualCap: null,
      familyCap: null,
    })
    expect(result.calculatedAmount.toNumber()).toBe(2000)
    expect(result.finalAmount.toNumber()).toBe(2000)
    expect(result.planShare.toNumber()).toBe(8000)
    expect(result.annualCapApplied).toBe(false)
    expect(result.capsApplied).toHaveLength(0)
  })

  it('returns zero when percentage is 0', () => {
    const result = calculateCoContribution({
      rule: rule({ type: 'PERCENTAGE', percentage: 0 }),
      serviceCost: new Decimal(5000),
      memberYtdTotal: zero, familyYtdTotal: zero,
      individualCap: null, familyCap: null,
    })
    expect(result.finalAmount.toNumber()).toBe(0)
    expect(result.planShare.toNumber()).toBe(5000)
  })

  it('clamps to per-visit cap when calculated exceeds cap', () => {
    const result = calculateCoContribution({
      rule: rule({ type: 'PERCENTAGE', percentage: 20, perVisitCap: 1500 }),
      serviceCost: new Decimal(10000), // 20% = 2000 > cap 1500
      memberYtdTotal: zero, familyYtdTotal: zero,
      individualCap: null, familyCap: null,
    })
    expect(result.cappedAmount.toNumber()).toBe(1500)
    expect(result.finalAmount.toNumber()).toBe(1500)
    expect(result.capsApplied).toContain('PER_VISIT_CAP')
  })

  it('does not apply per-visit cap when calculated is below cap', () => {
    const result = calculateCoContribution({
      rule: rule({ type: 'PERCENTAGE', percentage: 10, perVisitCap: 5000 }),
      serviceCost: new Decimal(10000), // 10% = 1000 < cap 5000
      memberYtdTotal: zero, familyYtdTotal: zero,
      individualCap: null, familyCap: null,
    })
    expect(result.finalAmount.toNumber()).toBe(1000)
    expect(result.capsApplied).not.toContain('PER_VISIT_CAP')
  })
})

// ─── FIXED_AMOUNT ──────────────────────────────────────────────────────────

describe('FIXED_AMOUNT rule', () => {
  it('returns the fixed amount regardless of service cost', () => {
    const result = calculateCoContribution({
      rule: rule({ type: 'FIXED_AMOUNT', fixedAmount: 500 }),
      serviceCost: new Decimal(30000),
      memberYtdTotal: zero, familyYtdTotal: zero,
      individualCap: null, familyCap: null,
    })
    expect(result.calculatedAmount.toNumber()).toBe(500)
    expect(result.finalAmount.toNumber()).toBe(500)
    expect(result.planShare.toNumber()).toBe(29500)
  })

  it('clamps fixed amount to per-visit cap', () => {
    const result = calculateCoContribution({
      rule: rule({ type: 'FIXED_AMOUNT', fixedAmount: 2000, perVisitCap: 1000 }),
      serviceCost: new Decimal(15000),
      memberYtdTotal: zero, familyYtdTotal: zero,
      individualCap: null, familyCap: null,
    })
    expect(result.finalAmount.toNumber()).toBe(1000)
    expect(result.capsApplied).toContain('PER_VISIT_CAP')
  })
})

// ─── HYBRID ────────────────────────────────────────────────────────────────

describe('HYBRID rule', () => {
  it('uses percentage when it exceeds the fixed floor', () => {
    const result = calculateCoContribution({
      rule: rule({ type: 'HYBRID', percentage: 20, fixedAmount: 500 }),
      serviceCost: new Decimal(10000), // 20% = 2000 > fixed 500
      memberYtdTotal: zero, familyYtdTotal: zero,
      individualCap: null, familyCap: null,
    })
    expect(result.finalAmount.toNumber()).toBe(2000)
  })

  it('uses fixed floor when percentage is below it', () => {
    const result = calculateCoContribution({
      rule: rule({ type: 'HYBRID', percentage: 5, fixedAmount: 500 }),
      serviceCost: new Decimal(5000), // 5% = 250 < fixed 500
      memberYtdTotal: zero, familyYtdTotal: zero,
      individualCap: null, familyCap: null,
    })
    expect(result.finalAmount.toNumber()).toBe(500)
  })
})

// ─── NONE ──────────────────────────────────────────────────────────────────

describe('NONE rule', () => {
  it('returns zero member share — plan covers everything', () => {
    const result = calculateCoContribution({
      rule: rule({ type: 'NONE' }),
      serviceCost: new Decimal(50000),
      memberYtdTotal: zero, familyYtdTotal: zero,
      individualCap: null, familyCap: null,
    })
    expect(result.finalAmount.toNumber()).toBe(0)
    expect(result.planShare.toNumber()).toBe(50000)
  })
})

// ─── ANNUAL INDIVIDUAL CAP ─────────────────────────────────────────────────

describe('individual annual cap', () => {
  it('reduces final amount to remaining headroom', () => {
    const result = calculateCoContribution({
      rule: rule({ type: 'PERCENTAGE', percentage: 20 }),
      serviceCost: new Decimal(10000), // calculated = 2000
      memberYtdTotal: new Decimal(9500), // only 500 remaining of 10000 cap
      familyYtdTotal: zero,
      individualCap: new Decimal(10000),
      familyCap: null,
    })
    expect(result.finalAmount.toNumber()).toBe(500)
    expect(result.annualCapApplied).toBe(true)
    expect(result.capsApplied).toContain('INDIVIDUAL_ANNUAL_CAP')
  })

  it('returns zero when cap is fully exhausted', () => {
    const result = calculateCoContribution({
      rule: rule({ type: 'PERCENTAGE', percentage: 20 }),
      serviceCost: new Decimal(10000),
      memberYtdTotal: new Decimal(10000), // already at cap
      familyYtdTotal: zero,
      individualCap: new Decimal(10000),
      familyCap: null,
    })
    expect(result.finalAmount.toNumber()).toBe(0)
    expect(result.annualCapApplied).toBe(true)
  })

  it('does not apply cap when ytd is below limit', () => {
    const result = calculateCoContribution({
      rule: rule({ type: 'PERCENTAGE', percentage: 10 }),
      serviceCost: new Decimal(5000), // calculated = 500
      memberYtdTotal: new Decimal(2000), // well below 10000 cap
      familyYtdTotal: zero,
      individualCap: new Decimal(10000),
      familyCap: null,
    })
    expect(result.finalAmount.toNumber()).toBe(500)
    expect(result.annualCapApplied).toBe(false)
  })
})

// ─── FAMILY CAP ────────────────────────────────────────────────────────────

describe('family annual cap', () => {
  it('caps at family remaining even when individual has headroom', () => {
    const result = calculateCoContribution({
      rule: rule({ type: 'PERCENTAGE', percentage: 20 }),
      serviceCost: new Decimal(10000), // calculated = 2000
      memberYtdTotal: new Decimal(1000),
      familyYtdTotal: new Decimal(24800), // only 200 left of 25000 family cap
      individualCap: new Decimal(10000),
      familyCap: new Decimal(25000),
    })
    expect(result.finalAmount.toNumber()).toBe(200)
    expect(result.capsApplied).toContain('FAMILY_ANNUAL_CAP')
  })

  it('applies both individual and family caps when both constrain', () => {
    const result = calculateCoContribution({
      rule: rule({ type: 'PERCENTAGE', percentage: 20 }),
      serviceCost: new Decimal(10000), // calculated = 2000
      memberYtdTotal: new Decimal(9800), // 200 left individually
      familyYtdTotal: new Decimal(24700), // 300 left family
      individualCap: new Decimal(10000),
      familyCap: new Decimal(25000),
    })
    // Individual cap is binding (200 < 300)
    expect(result.finalAmount.toNumber()).toBe(200)
    expect(result.capsApplied).toContain('INDIVIDUAL_ANNUAL_CAP')
  })
})

// ─── PLAN SHARE INVARIANT ─────────────────────────────────────────────────

describe('plan share invariant', () => {
  it('always equals serviceCost minus finalAmount', () => {
    const serviceCost = new Decimal(25000)
    const result = calculateCoContribution({
      rule: rule({ type: 'PERCENTAGE', percentage: 15, perVisitCap: 2000 }),
      serviceCost,
      memberYtdTotal: new Decimal(8000),
      familyYtdTotal: new Decimal(15000),
      individualCap: new Decimal(10000),
      familyCap: new Decimal(25000),
    })
    expect(result.planShare.toNumber()).toBe(
      serviceCost.sub(result.finalAmount).toNumber()
    )
  })
})
