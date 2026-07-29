import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * F76-GAP-01 — the ManagePanel render gate. Structural edits (tariffs, rules,
 * exclusions, branches) stay DRAFT-only via `editable`; applicability
 * (payers/schemes) follows the separate `applicabilityEditable`, which is also
 * true on ACTIVE contracts. A live (ACTIVE) amendment surfaces a required
 * reason field.
 */

const mockPrisma = vi.hoisted(() => ({
  client: { findMany: vi.fn() },
  providerBranch: { findMany: vi.fn() },
  contractBranch: { findMany: vi.fn() },
  providerTariff: { findMany: vi.fn() },
  providerContractExclusion: { findMany: vi.fn() },
  pricingRule: { findMany: vi.fn() },
  contractApplicability: { findMany: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

// The panel passes these as form `action` props only; stub the module so
// importing ManagePanel doesn't pull in the real server-action dependencies.
vi.mock('@/app/(admin)/contracts/[id]/manage-actions', () => ({
  addApplicabilityAction: vi.fn(),
  removeApplicabilityAction: vi.fn(),
  attachBranchAction: vi.fn(),
  detachBranchAction: vi.fn(),
  createProviderBranchAction: vi.fn(),
  addTariffLineAction: vi.fn(),
  deactivateTariffAction: vi.fn(),
  addExclusionAction: vi.fn(),
  addPricingRuleAction: vi.fn(),
  deactivatePricingRuleAction: vi.fn(),
}))

import { ManagePanel } from '@/app/(admin)/contracts/[id]/ManagePanel'

const CLIENTS = [{ id: 'cl-1', name: 'NWSC' }, { id: 'cl-2', name: 'Pearl Health' }]
const APPLICABILITY = [
  { id: 'a-1', inclusionType: 'INCLUDE', benefitCategory: null, memberCategory: null, client: { name: 'NWSC' } },
]

function primePrisma(applicability: unknown[] = []) {
  mockPrisma.client.findMany.mockResolvedValue(CLIENTS)
  mockPrisma.providerBranch.findMany.mockResolvedValue([])
  mockPrisma.contractBranch.findMany.mockResolvedValue([])
  mockPrisma.providerTariff.findMany.mockResolvedValue([])
  mockPrisma.providerContractExclusion.findMany.mockResolvedValue([])
  mockPrisma.pricingRule.findMany.mockResolvedValue([])
  mockPrisma.contractApplicability.findMany.mockResolvedValue(applicability)
}

const base = { contractId: 'c-1', providerId: 'p-1', branchScope: 'ALL_BRANCHES' }
const REASON = /Reason for amending a live contract/i

beforeEach(() => vi.clearAllMocks())

describe('ManagePanel applicability gating (F76-GAP-01)', () => {
  it('DRAFT: applicability AND structural edits are all available, with no reason field', async () => {
    primePrisma(APPLICABILITY)
    render(await ManagePanel({ ...base, editable: true, applicabilityEditable: true }))

    // applicability add form
    expect(screen.getByPlaceholderText('Benefit (opt)')).toBeInTheDocument()
    // structural edit forms present while DRAFT
    expect(screen.getByPlaceholderText('Service name')).toBeInTheDocument() // tariff add
    expect(screen.getByPlaceholderText('Excluded service')).toBeInTheDocument() // exclusion add
    // DRAFT setup is frictionless — no live-amendment reason field
    expect(screen.queryByPlaceholderText(REASON)).toBeNull()
  })

  it('ACTIVE: ONLY applicability add/remove is available; tariffs/rules/exclusions stay locked; reason required', async () => {
    primePrisma(APPLICABILITY)
    render(await ManagePanel({ ...base, editable: false, applicabilityEditable: true }))

    // applicability add form + the live-amendment reason field
    expect(screen.getByPlaceholderText('Benefit (opt)')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(REASON)).toBeInTheDocument()
    // existing applicability row is rendered (as a row span, distinct from the
    // payer <option> that also reads "NWSC") and is removable
    expect(screen.getByText('NWSC', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText('remove')).toBeInTheDocument()
    // structural edits are NOT rendered on an ACTIVE contract
    expect(screen.queryByPlaceholderText('Service name')).toBeNull() // no tariff add
    expect(screen.queryByPlaceholderText('Excluded service')).toBeNull() // no exclusion add
  })

  it('locked (e.g. SUSPENDED / UNDER_REVIEW): neither applicability nor structural forms render', async () => {
    primePrisma(APPLICABILITY)
    render(await ManagePanel({ ...base, editable: false, applicabilityEditable: false }))

    expect(screen.queryByPlaceholderText('Benefit (opt)')).toBeNull() // no applicability add
    expect(screen.queryByText('remove')).toBeNull() // no remove control
    expect(screen.queryByPlaceholderText('Service name')).toBeNull() // no tariff add
  })
})
