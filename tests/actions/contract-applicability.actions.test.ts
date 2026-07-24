import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * F76-GAP-01 — applicability (payer/scheme) add/remove is reachable on ACTIVE
 * contracts, not just DRAFT. On a live contract the change is governed by a
 * required reason (the confirmation) that is folded into the existing
 * CONTRACT_APPLICABILITY_ADDED / _REMOVED audit. DRAFT setup stays frictionless.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────
const mockPrisma = vi.hoisted(() => ({
  providerContract: { findUnique: vi.fn() },
  contractApplicability: { create: vi.fn(), update: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

vi.mock('@/lib/rbac', () => ({
  requireRole: vi.fn().mockResolvedValue({ user: { id: 'user-1', tenantId: 'tenant-1' } }),
  ROLES: { UNDERWRITING: 'UNDERWRITING' },
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// redirect() and back()→redirect() both throw NEXT_REDIRECT (as Next does);
// capture the target URL so we can assert which branch fired.
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    const e = new Error('NEXT_REDIRECT') as Error & { digest?: string }
    e.digest = url
    throw e
  }),
)
vi.mock('next/navigation', () => ({ redirect: redirectMock }))

// auditManage() dynamically imports @/lib/audit — intercept writeAudit.
const writeAuditMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('@/lib/audit', () => ({ writeAudit: writeAuditMock }))

// Imported at module load by a sibling action; unused by the ones under test.
vi.mock('@/server/services/service-category.service', () => ({
  ServiceCategoryService: { resolveCategoryId: vi.fn() },
}))

import {
  addApplicabilityAction,
  removeApplicabilityAction,
} from '@/app/(admin)/contracts/[id]/manage-actions'

function fd(entries: Record<string, string>): FormData {
  const f = new FormData()
  Object.entries(entries).forEach(([k, v]) => f.set(k, v))
  return f
}

const DRAFT = { id: 'c-1', contractNumber: 'PC-2026-001', status: 'DRAFT' }
const ACTIVE = { id: 'c-1', contractNumber: 'PC-2026-128', status: 'ACTIVE' }

beforeEach(() => vi.clearAllMocks())

describe('addApplicabilityAction', () => {
  it('adds a payer on a DRAFT contract without requiring a reason', async () => {
    mockPrisma.providerContract.findUnique.mockResolvedValue(DRAFT)
    mockPrisma.contractApplicability.create.mockResolvedValue({ id: 'a-1' })

    await expect(addApplicabilityAction(fd({ contractId: 'c-1', clientId: 'cl-1' })))
      .rejects.toThrow('NEXT_REDIRECT')

    expect(mockPrisma.contractApplicability.create).toHaveBeenCalledOnce()
    expect(mockPrisma.contractApplicability.create.mock.calls[0][0].data.clientId).toBe('cl-1')
    expect(writeAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CONTRACT_APPLICABILITY_ADDED' }),
    )
    // success path ends at back() → clean contract URL (no ?error=)
    expect(redirectMock).toHaveBeenLastCalledWith('/contracts/c-1')
  })

  it('requires a payer selection', async () => {
    mockPrisma.providerContract.findUnique.mockResolvedValue(DRAFT)

    await expect(addApplicabilityAction(fd({ contractId: 'c-1' })))
      .rejects.toThrow('NEXT_REDIRECT')

    expect(mockPrisma.contractApplicability.create).not.toHaveBeenCalled()
    expect(redirectMock).toHaveBeenCalledWith(expect.stringContaining('Select'))
  })

  it('blocks amending a live ACTIVE contract when no reason is supplied', async () => {
    mockPrisma.providerContract.findUnique.mockResolvedValue(ACTIVE)

    await expect(addApplicabilityAction(fd({ contractId: 'c-1', clientId: 'cl-1' })))
      .rejects.toThrow('NEXT_REDIRECT')

    expect(mockPrisma.contractApplicability.create).not.toHaveBeenCalled()
    expect(writeAuditMock).not.toHaveBeenCalled()
    expect(redirectMock).toHaveBeenCalledWith(expect.stringContaining('reason'))
  })

  it('adds a payer to a live ACTIVE contract with a reason, recording it in the audit', async () => {
    mockPrisma.providerContract.findUnique.mockResolvedValue(ACTIVE)
    mockPrisma.contractApplicability.create.mockResolvedValue({ id: 'a-2' })

    await expect(
      addApplicabilityAction(
        fd({ contractId: 'c-1', clientId: 'cl-nwsc', reason: 'Entitle NWSC at Aga Khan' }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockPrisma.contractApplicability.create).toHaveBeenCalledOnce()
    const audit = writeAuditMock.mock.calls[0][0]
    expect(audit.action).toBe('CONTRACT_APPLICABILITY_ADDED')
    expect(audit.description).toContain('ACTIVE')
    expect(audit.description).toContain('Entitle NWSC at Aga Khan')
  })
})

describe('removeApplicabilityAction', () => {
  it('removes a payer on a DRAFT contract without requiring a reason', async () => {
    mockPrisma.providerContract.findUnique.mockResolvedValue(DRAFT)
    mockPrisma.contractApplicability.update.mockResolvedValue({})

    await expect(removeApplicabilityAction(fd({ contractId: 'c-1', applicabilityId: 'a-1' })))
      .rejects.toThrow('NEXT_REDIRECT')

    expect(mockPrisma.contractApplicability.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'a-1' }, data: { isActive: false } }),
    )
    expect(writeAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CONTRACT_APPLICABILITY_REMOVED' }),
    )
  })

  it('blocks removing a payer from a live ACTIVE contract when no reason is supplied', async () => {
    mockPrisma.providerContract.findUnique.mockResolvedValue(ACTIVE)

    await expect(removeApplicabilityAction(fd({ contractId: 'c-1', applicabilityId: 'a-1' })))
      .rejects.toThrow('NEXT_REDIRECT')

    expect(mockPrisma.contractApplicability.update).not.toHaveBeenCalled()
    expect(writeAuditMock).not.toHaveBeenCalled()
    expect(redirectMock).toHaveBeenCalledWith(expect.stringContaining('reason'))
  })

  it('removes a payer from a live ACTIVE contract with a reason, recording it in the audit', async () => {
    mockPrisma.providerContract.findUnique.mockResolvedValue(ACTIVE)
    mockPrisma.contractApplicability.update.mockResolvedValue({})

    await expect(
      removeApplicabilityAction(
        fd({ contractId: 'c-1', applicabilityId: 'a-1', reason: 'Scheme migrated to PC-2026-140' }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockPrisma.contractApplicability.update).toHaveBeenCalledOnce()
    const audit = writeAuditMock.mock.calls[0][0]
    expect(audit.action).toBe('CONTRACT_APPLICABILITY_REMOVED')
    expect(audit.description).toContain('Scheme migrated to PC-2026-140')
  })
})
