/**
 * IP-DEF-04 completion — with the fraud gate ENABLED, a same-day bed-day
 * overlap HARD-BLOCKS approval until cleared. Enables the gate, proves the
 * block, restores the original tenant setting. (Complements the gate run which
 * proved the HIGH alert + timeline warning with the gate off.)
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { CaseService } from '../src/server/services/case.service';
import { ClaimDecisionService } from '../src/server/services/claim-decision.service';
import { BenefitUsageService } from '../src/server/services/benefit-usage.service';
import { TenantSettingsService } from '../src/server/services/tenant-settings.service';

const clk = new Date('2026-08-01T06:00:00Z');
const day = (o: number) => { const d = new Date(clk); d.setUTCHours(0,0,0,0); d.setUTCDate(d.getUTCDate()+o); return d; };

async function main() {
  const rev = await prisma.user.findFirst({ where: { email: 'claims@medvex.co.ug' }, select: { id: true, tenantId: true } });
  const tenantId = rev!.tenantId;
  const provs = await prisma.provider.findMany({ where: { tenantId, contractStatus: { notIn: ['EXPIRED','SUSPENDED'] } }, select: { id: true } });
  let providerId = provs[0].id;
  for (const p of provs) { if ((await prisma.providerContract.count({ where: { providerId: p.id } })) === 0) { providerId = p.id; break; } }
  const cands = await prisma.member.findMany({ where: { tenantId, status: 'ACTIVE', relationship: 'PRINCIPAL', packageVersion: { benefits: { some: { category: 'INPATIENT' } } } }, select: { id: true }, take: 60 });
  let memberId = '';
  for (const m of cands) { const av = await BenefitUsageService.computeAvailability(prisma as any, { memberId: m.id, benefitCategory: 'INPATIENT', requestedAmount: 60_000, serviceDate: clk }); if (av && av.payableCeiling >= 60_000) { memberId = m.id; break; } }
  if (!memberId) { console.log('❌ no member headroom'); process.exit(1); }

  const before = await TenantSettingsService.getClaimControls(tenantId);
  let caseId = ''; let sliceId = '';
  try {
    await TenantSettingsService.updateClaimControls(tenantId, { requireFraudClearanceBeforeApproval: true, fraudApprovalSeverityThreshold: 'MEDIUM' }, rev!.id);
    console.log(`fraud gate ENABLED (was requireClearance=${before.requireFraudClearanceBeforeApproval})`);

    const cs = await CaseService.openCase({ tenantId, memberId, providerId, caseType: 'INPATIENT_ADMISSION', benefitCategory: 'INPATIENT', admissionDate: day(-2), openedById: rev!.id });
    caseId = cs.id;
    await CaseService.addServiceEntry({ tenantId, caseId, entryDate: day(-1), category: 'OTHER', serviceCode: 'WARD-GEN', description: 'General ward bed day', quantity: 1, unitAmount: 20_000, enteredById: rev!.id });
    await CaseService.addServiceEntry({ tenantId, caseId, entryDate: day(-1), category: 'OTHER', serviceCode: 'ICU-DAY', description: 'ICU bed day', quantity: 1, unitAmount: 30_000, enteredById: rev!.id });
    const slice = await CaseService.cutInterimSlice({ tenantId, caseId, cutoffDate: clk, invoiceNumber: `DEF04GB-${Date.now()}`, cutById: rev!.id });
    sliceId = slice.id;
    const alert = await prisma.claimFraudAlert.findFirst({ where: { claimId: sliceId, rule: 'Overlapping Bed-Day Charges' }, select: { severity: true, resolved: true } });

    let outcome = 'NOT BLOCKED (defect)';
    try { await ClaimDecisionService.decide(tenantId, sliceId, { action: 'APPROVED', approvedAmount: 50_000, reviewerId: rev!.id, matrixSatisfied: true }); }
    catch (e: any) { outcome = /fraud/i.test(e.message) ? 'BLOCKED by fraud gate' : `blocked-other(${e.message.slice(0,50)})`; }
    const st = (await prisma.claim.findUnique({ where: { id: sliceId }, select: { status: true } }))?.status;
    const pass = alert?.severity === 'HIGH' && /BLOCKED by fraud/.test(outcome) && st === 'RECEIVED';
    console.log(`slice alert=${alert?.severity} resolved=${alert?.resolved}; approval → ${outcome}; slice status=${st}`);
    console.log(`\n${pass ? '✅ IP-DEF-04 BLOCK CONFIRMED' : '❌ IP-DEF-04 block FAILED'} — bed-day overlap hard-blocks approval until cleared`);
  } finally {
    // restore the original tenant setting no matter what
    await TenantSettingsService.updateClaimControls(tenantId, { requireFraudClearanceBeforeApproval: before.requireFraudClearanceBeforeApproval, fraudApprovalSeverityThreshold: before.fraudApprovalSeverityThreshold }, rev!.id);
    const restored = await TenantSettingsService.getClaimControls(tenantId);
    console.log(`fraud gate RESTORED → requireClearance=${restored.requireFraudClearanceBeforeApproval}, threshold=${restored.fraudApprovalSeverityThreshold}`);
    if (sliceId) { await prisma.claimFraudAlert.deleteMany({ where: { claimId: sliceId } }).catch(()=>{}); await prisma.adjudicationLog.deleteMany({ where: { claimId: sliceId } }).catch(()=>{}); await prisma.claimLine.deleteMany({ where: { claimId: sliceId } }).catch(()=>{}); }
    if (caseId) { await prisma.activityLog.deleteMany({ where: { entityId: caseId } }).catch(()=>{}); await prisma.caseServiceEntry.deleteMany({ where: { caseId } }).catch(()=>{}); if (sliceId) await prisma.claim.deleteMany({ where: { id: sliceId } }).catch(()=>{}); await prisma.clinicalCase.deleteMany({ where: { id: caseId } }).catch(()=>{}); }
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error('ERROR', e); await prisma.$disconnect(); process.exit(2); });
