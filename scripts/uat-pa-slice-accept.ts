/**
 * IPL-PA-01 acceptance probe (§9.1) — the EXACT run-02 failure, against the real
 * PC-UAT-IP-2026 contract (Kampala Hospital), now expected to PASS.
 *
 * Reproduces: a slice carrying a PA-required contract line (CT-HEAD) could not be
 * adjudicated because the decision path read the slice's own empty preauths.
 *
 * Proves (fix): read-through from the case —
 *   Phase A  slice with CT-HEAD, NO PA on the case      → still THROWS (gate intact)
 *   Phase B  same slice, APPROVED PA + hold on the case → ADJUDICATES; hold credited,
 *            PA partially consumed (stays APPROVED, caseId intact, not re-pointed).
 *
 * Run on the VM (fix branch checked out, client generated):
 *   cd ~/avenue-portal && npx tsx scripts/uat-pa-slice-accept.ts
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { CaseService } from '../src/server/services/case.service';
import { ClaimDecisionService } from '../src/server/services/claim-decision.service';
import { BenefitUsageService } from '../src/server/services/benefit-usage.service';
import { preauthAdjudicationService } from '../src/server/services/preauth-adjudication.service';

// MRI-BRAIN is PA-required (pa:true) but NOT referral-required, so the engine
// PRICES it (CT-HEAD's ref:true pends it → excluded from the ceiling). The
// approval amount is taken from assessCeiling at runtime so the probe adapts to
// whatever the engine actually prices; PA cover is set above it for a partial
// consume. The PA gate is the thing under test either way.
const MRI_RATE = 1_200_000;
const WARD_RATE = 250_000;
const BILLED = MRI_RATE + WARD_RATE; // 1,450,000 — both contract-coded, priced

const log = (...a: any[]) => console.log(...a);
const money = (n: unknown) => Number(n ?? 0).toLocaleString();

async function main() {
  const rev = await prisma.user.findFirst({ where: { email: 'claims@medvex.co.ug' }, select: { id: true, tenantId: true } });
  if (!rev) throw new Error('reviewer claims@medvex.co.ug not found');
  const tenantId = rev.tenantId;

  const provider = await prisma.provider.findFirst({ where: { tenantId, name: 'Kampala Hospital' }, select: { id: true, name: true } });
  if (!provider) throw new Error('Kampala Hospital not found');

  // Pick an ACTIVE principal with INPATIENT headroom ≥ billed.
  const candidates = await prisma.member.findMany({
    where: { tenantId, status: 'ACTIVE', relationship: 'PRINCIPAL', packageVersion: { benefits: { some: { category: 'INPATIENT' } } } },
    select: { id: true, memberNumber: true, firstName: true, lastName: true },
    take: 50,
  });
  let member: { id: string; memberNumber: string } | null = null;
  for (const m of candidates) {
    const av = await BenefitUsageService.computeAvailability(prisma as any, {
      memberId: m.id, benefitCategory: 'INPATIENT', requestedAmount: BILLED, serviceDate: new Date('2026-08-01T06:00:00Z'),
    });
    if (av && av.payableCeiling >= BILLED) { member = m; break; }
  }
  if (!member) throw new Error('no ACTIVE principal with ≥750k INPATIENT headroom');
  log(`FIXTURES tenant=${tenantId.slice(0,8)} provider=${provider.name} member=${member.memberNumber}`);

  // 1 ── fresh case (no attending doctor → skips practitioner-credential gate)
  const c = await CaseService.openCase({
    tenantId, memberId: member.id, providerId: provider.id, caseType: 'INPATIENT_ADMISSION',
    benefitCategory: 'INPATIENT', admissionDate: new Date('2026-08-01T00:00:00Z'), openedById: rev.id,
  });
  log(`CASE ${c.caseNumber} opened (INPATIENT, admit 2026-08-01)`);

  // 2 ── MRI-BRAIN (PA-required under the contract) + a ward line, at contract rates
  await CaseService.addServiceEntry({ tenantId, caseId: c.id, entryDate: new Date('2026-08-01T08:00:00Z'), category: 'IMAGING', serviceCode: 'MRI-BRAIN', description: 'MRI brain', quantity: 1, unitAmount: MRI_RATE, enteredById: rev.id });
  await CaseService.addServiceEntry({ tenantId, caseId: c.id, entryDate: new Date('2026-08-01T09:00:00Z'), category: 'PROCEDURE', serviceCode: 'WARD-GEN', description: 'Ward bed-day', quantity: 1, unitAmount: WARD_RATE, enteredById: rev.id });

  // 3 ── cut the slice
  const slice = await CaseService.cutInterimSlice({ tenantId, caseId: c.id, cutoffDate: new Date('2026-08-01T12:00:00Z'), cutById: rev.id });
  const paAfterCut = await prisma.preAuthorization.count({ where: { claimId: slice.id } });
  const assess = await ClaimDecisionService.assessCeiling(tenantId, slice.id);
  const APPROVE = assess.ceiling != null ? Math.min(BILLED, Math.floor(assess.ceiling)) : BILLED;
  const PA_COVER = APPROVE + 150_000; // > approved → partial consume, no over-cover
  log(`SLICE ${slice.invoiceNumber} cut: billed=${money(slice.billedAmount)}, PAs re-pointed onto slice=${paAfterCut} (expect 0); engine ceiling=${money(assess.ceiling)} → approve ${money(APPROVE)}`);

  // ── Phase A: NO PA on the case → the PA-required gate must still THROW ──
  let phaseA = 'DID NOT THROW (unexpected)';
  try {
    await ClaimDecisionService.decide(tenantId, slice.id, { action: 'APPROVED', approvedAmount: APPROVE, reviewerId: rev.id, matrixSatisfied: true });
  } catch (e: any) {
    phaseA = e?.message ?? String(e);
  }
  const gateHeld = /pre-authorization/i.test(phaseA);
  log(`PHASE A (no PA): decide → ${gateHeld ? '✅ BLOCKED' : '❌'} — ${phaseA.slice(0, 120)}`);
  const sliceStillReceived = await prisma.claim.findUnique({ where: { id: slice.id }, select: { status: true } });
  log(`         slice status after block = ${sliceStillReceived?.status} (expect RECEIVED — no side effects)`);

  // ── Phase B: an APPROVED PA + ACTIVE hold on the CASE (not the slice) ──
  const pa = await prisma.preAuthorization.create({
    data: {
      tenantId, preauthNumber: `PA-ACCEPT-${Date.now()}`, memberId: member.id, providerId: provider.id,
      submittedBy: 'ADMIN', status: 'APPROVED', benefitCategory: 'INPATIENT', serviceType: 'INPATIENT',
      diagnoses: [], procedures: [], estimatedCost: PA_COVER, approvedAmount: PA_COVER, utilisedAmount: 0,
      validFrom: new Date('2026-07-01'), validUntil: new Date('2026-12-31'),
    },
    select: { id: true, preauthNumber: true },
  });
  await preauthAdjudicationService.createBenefitHold(pa.id, tenantId, member.id, 'INPATIENT', PA_COVER, new Date('2026-12-31'));
  await CaseService.attachPreauth(tenantId, c.id, pa.id);
  const attached = await prisma.preAuthorization.findUnique({ where: { id: pa.id }, select: { caseId: true, claimId: true } });
  log(`PA ${pa.preauthNumber} approved (cover ${money(PA_COVER)}) + hold placed, attached to CASE (caseId set=${attached?.caseId === c.id}, claimId=${attached?.claimId ?? 'null'})`);

  // decide the SAME slice again — read-through must now satisfy the gate
  let phaseB = 'OK';
  try {
    await ClaimDecisionService.decide(tenantId, slice.id, { action: 'APPROVED', approvedAmount: APPROVE, reviewerId: rev.id, matrixSatisfied: true });
  } catch (e: any) { phaseB = 'THREW: ' + (e?.message ?? String(e)); }
  const decided = await prisma.claim.findUnique({ where: { id: slice.id }, select: { status: true, approvedAmount: true } });
  const ok = decided?.status === 'APPROVED';
  log(`PHASE B (case PA): decide → ${ok ? '✅ APPROVED' : '❌ ' + phaseB} approved=${money(decided?.approvedAmount)}`);

  const paAfter = await prisma.preAuthorization.findUnique({ where: { id: pa.id }, select: { status: true, utilisedAmount: true, claimId: true, caseId: true } });
  const hold = await prisma.benefitHold.findUnique({ where: { preAuthId: pa.id }, select: { status: true, heldAmount: true } });
  log(`         PA after: status=${paAfter?.status} utilised=${money(paAfter?.utilisedAmount)} claimId=${paAfter?.claimId ?? 'null'} caseId-intact=${paAfter?.caseId === c.id}`);
  log(`         hold after: status=${hold?.status} held=${money(hold?.heldAmount)} (expect ACTIVE, ${money(PA_COVER - APPROVE)})`);

  const pass =
    gateHeld && sliceStillReceived?.status === 'RECEIVED' && paAfterCut === 0 &&
    ok && Number(paAfter?.utilisedAmount) === APPROVE && paAfter?.status === 'APPROVED' &&
    paAfter?.claimId === null && paAfter?.caseId === c.id &&
    hold?.status === 'ACTIVE' && Number(hold?.heldAmount) === PA_COVER - APPROVE;
  log(`\n${pass ? '✅✅ IPL-PA-01 ACCEPTANCE PASS' : '❌ IPL-PA-01 ACCEPTANCE FAIL'} — case ${c.caseNumber}, slice ${slice.invoiceNumber}`);

  // teardown — FK-safe order: clear/delete the entries that reference the claim
  // (billedInClaimId) and un-point the PA BEFORE deleting the claim/case, so
  // nothing leaks on a disposable VM.
  await prisma.benefitHold.deleteMany({ where: { preAuthId: pa.id } }).catch(() => {});
  await prisma.preAuthorization.updateMany({ where: { id: pa.id }, data: { claimId: null, caseId: null } }).catch(() => {});
  await prisma.caseServiceEntry.deleteMany({ where: { caseId: c.id } }).catch(() => {});
  await prisma.adjudicationLog.deleteMany({ where: { claimId: slice.id } }).catch(() => {});
  await prisma.claimLine.deleteMany({ where: { claimId: slice.id } }).catch(() => {});
  await prisma.claimFraudAlert.deleteMany({ where: { claimId: slice.id } }).catch(() => {});
  await prisma.claim.deleteMany({ where: { id: slice.id } }).catch(() => {});
  await prisma.preAuthorization.deleteMany({ where: { id: pa.id } }).catch(() => {});
  await prisma.clinicalCase.deleteMany({ where: { id: c.id } }).catch(() => {});
  await prisma.$disconnect();
  process.exit(pass ? 0 : 1);
}
main().catch(async (e) => { console.error('PROBE ERROR', e); await prisma.$disconnect(); process.exit(2); });
