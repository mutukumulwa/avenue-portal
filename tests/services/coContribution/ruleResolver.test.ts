import { describe, it, expect } from 'vitest'
import { resolveRule, providerToNetworkTier } from '@/server/services/coContribution/ruleResolver'
import type { CoContributionRule, Provider } from '@prisma/client'

function rule(overrides: Partial<CoContributionRule>): CoContributionRule {
  return {
    id: 'r1', tenantId: 't1', packageId: 'pkg-1',
    benefitCategory: null, networkTier: 'TIER_1',
    type: 'PERCENTAGE', fixedAmount: null, percentage: 20,
    perVisitCap: null, perEncounterCap: null,
    effectiveFrom: new Date('2024-01-01'), effectiveTo: null, isActive: true,
    createdBy: null, updatedBy: null,
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  } as CoContributionRule
}

const NOW = new Date('2025-06-15')
const PAST = new Date('2024-01-01')
const FUTURE = new Date('2030-01-01')

// ─── providerToNetworkTier ─────────────────────────────────────────────────

describe('providerToNetworkTier', () => {
  it('maps OWN → TIER_1', () => {
    expect(providerToNetworkTier({ tier: 'OWN' } as Provider)).toBe('TIER_1')
  })
  it('maps PARTNER → TIER_2', () => {
    expect(providerToNetworkTier({ tier: 'PARTNER' } as Provider)).toBe('TIER_2')
  })
  it('maps PANEL → TIER_3', () => {
    expect(providerToNetworkTier({ tier: 'PANEL' } as Provider)).toBe('TIER_3')
  })
})

// ─── resolveRule — active/inactive filtering ───────────────────────────────

describe('resolveRule — active filtering', () => {
  it('returns null when there are no rules', () => {
    expect(resolveRule([], 'TIER_1', null, NOW)).toBeNull()
  })

  it('ignores inactive rules', () => {
    const rules = [rule({ id: 'r1', isActive: false })]
    expect(resolveRule(rules, 'TIER_1', null, NOW)).toBeNull()
  })

  it('ignores rules not yet effective', () => {
    const rules = [rule({ effectiveFrom: new Date('2026-01-01') })]
    expect(resolveRule(rules, 'TIER_1', null, NOW)).toBeNull()
  })

  it('ignores expired rules', () => {
    const rules = [rule({ effectiveTo: new Date('2024-01-01') })]
    expect(resolveRule(rules, 'TIER_1', null, NOW)).toBeNull()
  })

  it('returns an active rule within its effective window', () => {
    const rules = [rule({ effectiveFrom: PAST, effectiveTo: FUTURE })]
    expect(resolveRule(rules, 'TIER_1', null, NOW)).not.toBeNull()
  })
})

// ─── resolveRule — specificity ranking ────────────────────────────────────

describe('resolveRule — specificity', () => {
  const globalRule  = rule({ id: 'global', benefitCategory: null, networkTier: 'TIER_1' })
  const tierRule    = rule({ id: 'tier',   benefitCategory: null, networkTier: 'TIER_2' })
  const catRule     = rule({ id: 'cat',    benefitCategory: 'OUTPATIENT', networkTier: 'TIER_1' })
  const exactRule   = rule({ id: 'exact',  benefitCategory: 'OUTPATIENT', networkTier: 'TIER_2' })

  it('prefers exact category+tier match over everything else', () => {
    const result = resolveRule([globalRule, tierRule, catRule, exactRule], 'TIER_2', 'OUTPATIENT', NOW)
    expect(result!.id).toBe('exact')
  })

  it('prefers category-only match over tier-only or global', () => {
    const result = resolveRule([globalRule, tierRule, catRule], 'TIER_2', 'OUTPATIENT', NOW)
    expect(result!.id).toBe('cat')
  })

  it('prefers tier-only match over global when no category rule', () => {
    const result = resolveRule([globalRule, tierRule], 'TIER_2', 'OUTPATIENT', NOW)
    expect(result!.id).toBe('tier')
  })

  it('falls back to global rule when nothing specific matches', () => {
    const result = resolveRule([globalRule], 'TIER_3', 'INPATIENT', NOW)
    expect(result!.id).toBe('global')
  })

  it('excludes rules with a non-matching category', () => {
    const dentalRule = rule({ id: 'dental', benefitCategory: 'DENTAL', networkTier: 'TIER_1' })
    const result = resolveRule([dentalRule, globalRule], 'TIER_1', 'OUTPATIENT', NOW)
    // dentalRule has benefitCategory=DENTAL which != OUTPATIENT → excluded; falls back to global
    expect(result!.id).toBe('global')
  })

  it('returns null when the only rule has a non-matching category', () => {
    const dentalRule = rule({ id: 'dental', benefitCategory: 'DENTAL', networkTier: 'TIER_1' })
    expect(resolveRule([dentalRule], 'TIER_1', 'OUTPATIENT', NOW)).toBeNull()
  })
})

// ─── resolveRule — claim date boundary conditions ─────────────────────────

describe('resolveRule — date boundaries', () => {
  it('includes a rule whose effectiveFrom equals the claim date', () => {
    const r = rule({ effectiveFrom: NOW, effectiveTo: null })
    expect(resolveRule([r], 'TIER_1', null, NOW)).not.toBeNull()
  })

  it('excludes a rule whose effectiveTo is strictly before claim date', () => {
    const yesterday = new Date(NOW.getTime() - 86400000)
    const r = rule({ effectiveTo: yesterday })
    expect(resolveRule([r], 'TIER_1', null, NOW)).toBeNull()
  })
})
