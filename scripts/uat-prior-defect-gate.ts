/**
 * §25 Prior-defect gate — IP-DEF-01..05 + OBS-IP-GL, service-level on the VM.
 * Each probe is self-contained (creates + tears down its own artefacts) and
 * reports PASS/FAIL; one failure never aborts the others.
 *   npx tsx scripts/uat-prior-defect-gate.ts
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { CaseService } from '../src/server/services/case.service';
import { ClaimDecisionService } from '../src/server/services/claim-decision.service';
import { BenefitUsageService } from '../src/server/services/benefit-usage.service';
import { preauthAdjudicationService } from '../src/server/services/preauth-adjudication.service';
import { HmsBatchService } from '../src/server/services/hms-batch.service';
import { claimAdjudicationService } from '../src/server/services/claim-adjudication.service';

type R = { id: string; pass: boolean; detail: string };
const results: R[] = [];
const rec = (id: string, pass: boolean, detail: string) => { results.push({ id, pass, detail }); console.log(`${pass ? '✅' : '❌'} ${id} — ${detail}`); };
const iso = (d: Date) => d.toISOString();
const day = (base: Date, off: number) => { const d = new Date(base); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + off); return d; };

async function ctx() {
  const rev = await prisma.user.findFirst({ where: { email: 'claims@medvex.co.ug' }, select: { id: true, tenantId: true } });
  const tenantId = rev!.tenantId;
  const provider = await prisma.provider.findFirst({ where: { tenantId, name: 'Kampala Hospital' }, select: { id: true } });
  // A provider with NO ProviderContract → assessCeiling null → the clean
  // reviewer-judgement approve path (isolates the idempotency / bed-day probes
  // from contract-pricing enforcement).
  const provs = await prisma.provider.findMany({ where: { tenantId, contractStatus: { notIn: ['EXPIRED', 'SUSPENDED'] } }, select: { id: true } });
  let noContractProviderId = '';
  for (const p of provs) { const n = await prisma.providerContract.count({ where: { providerId: p.id } }).catch(() => 1); if (n === 0) { noContractProviderId = p.id; break; } }
  if (!noContractProviderId) noContractProviderId = provider!.id;
  // member with INPATIENT headroom (fixtures may be depleted → scan)
  const cands = await prisma.member.findMany({ where: { tenantId, status: 'ACTIVE', relationship: 'PRINCIPAL', packageVersion: { benefits: { some: { category: 'INPATIENT' } } } }, select: { id: true, memberNumber: true }, take: 60 });
  let member: { id: string; memberNumber: string } | null = null;
  for (const m of cands) {
    const av = await BenefitUsageService.computeAvailability(prisma as any, { memberId: m.id, benefitCategory: 'INPATIENT', requestedAmount: 120_000, serviceDate: new Date('2026-08-01T06:00:00Z') });
    if (av && av.payableCeiling >= 120_000) { member = m; break; }
  }
  return { tenantId, reviewerId: rev!.id, providerId: provider!.id, noContractProviderId, member };
}

const clk = new Date('2026-08-01T06:00:00Z'); // VM controlled clock

// ─── IP-DEF-01 — approve a PA with reviewer notes → no crash, note persists ──
async function ipDef01(c: any) {
  if (!c.member) return rec('IP-DEF-01', false, 'no member with INPATIENT headroom (fixtures depleted)');
  const NOTE = 'Reviewer note: approved within GOP, imaging pre-authorised (IP-DEF-01 retest).';
  let paId = '';
  try {
    const pa = await prisma.preAuthorization.create({ data: {
      tenantId: c.tenantId, preauthNumber: `PA-DEF01-${Date.now()}`, memberId: c.member.id, providerId: c.providerId,
      submittedBy: 'ADMIN', status: 'SUBMITTED', benefitCategory: 'INPATIENT', serviceType: 'INPATIENT',
      diagnoses: [], procedures: [], estimatedCost: 40_000,
    }, select: { id: true } });
    paId = pa.id;
    await preauthAdjudicationService.approveByHuman(paId, c.tenantId, c.reviewerId, 40_000, NOTE, 30);
    const after = await prisma.preAuthorization.findUnique({ where: { id: paId }, select: { status: true, reviewNotes: true, gopNumber: true } });
    const ok = after?.status === 'APPROVED' && after?.reviewNotes === NOTE && !!after?.gopNumber;
    rec('IP-DEF-01', ok, `approve-with-notes: status=${after?.status}, reviewNotes persisted=${after?.reviewNotes === NOTE}, GOP=${after?.gopNumber ?? 'none'} (no raw-schema crash)`);
  } catch (e: any) {
    rec('IP-DEF-01', false, `THREW: ${e?.message ?? e}`);
  } finally {
    if (paId) { await prisma.benefitHold.deleteMany({ where: { preAuthId: paId } }).catch(()=>{}); await prisma.preAuthorization.deleteMany({ where: { id: paId } }).catch(()=>{}); }
  }
}

// ─── IP-DEF-02 — future / pre-admission / post-discharge entries blocked ─────
async function ipDef02(c: any) {
  if (!c.member) return rec('IP-DEF-02', false, 'no member');
  let caseId = '';
  try {
    const admit = day(clk, -3);
    const cs = await CaseService.openCase({ tenantId: c.tenantId, memberId: c.member.id, providerId: c.providerId, caseType: 'INPATIENT_ADMISSION', benefitCategory: 'INPATIENT', admissionDate: admit, openedById: c.reviewerId });
    caseId = cs.id;
    const add = (d: Date) => CaseService.addServiceEntry({ tenantId: c.tenantId, caseId, entryDate: d, category: 'OTHER', serviceCode: null, description: 'guard probe', quantity: 1, unitAmount: 10_000, enteredById: c.reviewerId });
    const caught: string[] = [];
    for (const [label, d] of [['future', day(clk, 5)], ['pre-admission', day(clk, -6)]] as [string, Date][]) {
      try { await add(d); caught.push(`${label}:NOT-BLOCKED`); } catch (e: any) { caught.push(`${label}:blocked(${/future|admission/i.test(e.message) ? 'ok' : 'msg?'})`); }
    }
    // post-discharge: set a dischargeDate while keeping the case OPEN, then add after it
    await prisma.clinicalCase.update({ where: { id: caseId }, data: { dischargeDate: day(clk, -1) } });
    try { await add(clk); caught.push('post-discharge:NOT-BLOCKED'); } catch (e: any) { caught.push(`post-discharge:blocked(${/discharge/i.test(e.message) ? 'ok' : 'msg?'})`); }
    const accrued = (await prisma.clinicalCase.findUnique({ where: { id: caseId }, select: { accruedAmount: true } }))?.accruedAmount;
    const allBlocked = caught.every((x) => x.includes('blocked(ok)'));
    rec('IP-DEF-02', allBlocked && Number(accrued) === 0, `${caught.join(', ')}; accrued=${Number(accrued)} (expect 0)`);
  } catch (e: any) {
    rec('IP-DEF-02', false, `SETUP THREW: ${e?.message ?? e}`);
  } finally {
    if (caseId) { await prisma.caseServiceEntry.deleteMany({ where: { caseId } }).catch(()=>{}); await prisma.clinicalCase.deleteMany({ where: { id: caseId } }).catch(()=>{}); }
  }
}

// ─── IP-DEF-03 — an approved slice cannot be re-decided (apply exactly once) ──
async function ipDef03(c: any) {
  if (!c.member) return rec('IP-DEF-03', false, 'no member');
  let caseId = ''; let sliceId = '';
  try {
    const admit = day(clk, -2);
    const cs = await CaseService.openCase({ tenantId: c.tenantId, memberId: c.member.id, providerId: c.noContractProviderId, caseType: 'INPATIENT_ADMISSION', benefitCategory: 'INPATIENT', admissionDate: admit, openedById: c.reviewerId });
    caseId = cs.id;
    await CaseService.addServiceEntry({ tenantId: c.tenantId, caseId, entryDate: day(clk, -1), category: 'OTHER', serviceCode: null, description: 'consult (reviewer-judgement, no contract)', quantity: 1, unitAmount: 40_000, enteredById: c.reviewerId });
    const slice = await CaseService.cutInterimSlice({ tenantId: c.tenantId, caseId, cutoffDate: clk, invoiceNumber: `DEF03-${Date.now()}`, cutById: c.reviewerId });
    sliceId = slice.id;
    await ClaimDecisionService.decide(c.tenantId, sliceId, { action: 'APPROVED', approvedAmount: 40_000, reviewerId: c.reviewerId, matrixSatisfied: true });
    let second = 'DID NOT THROW';
    try { await ClaimDecisionService.decide(c.tenantId, sliceId, { action: 'APPROVED', approvedAmount: 40_000, reviewerId: c.reviewerId, matrixSatisfied: true }); }
    catch (e: any) { second = e?.message ?? String(e); }
    const blocked = /current status/i.test(second);
    const st = await prisma.claim.findUnique({ where: { id: sliceId }, select: { status: true, approvedAmount: true } });
    rec('IP-DEF-03', blocked && st?.status === 'APPROVED', `1st decide APPROVED ${Number(st?.approvedAmount)}; 2nd decide ${blocked ? 'BLOCKED (idempotent)' : 'ALLOWED (DEFECT)'} — ${second.slice(0, 80)}`);
  } catch (e: any) {
    rec('IP-DEF-03', false, `SETUP THREW: ${e?.message ?? e}`);
  } finally {
    if (sliceId) { await prisma.adjudicationLog.deleteMany({ where: { claimId: sliceId } }).catch(()=>{}); await prisma.claimLine.deleteMany({ where: { claimId: sliceId } }).catch(()=>{}); }
    if (caseId) { await prisma.caseServiceEntry.deleteMany({ where: { caseId } }).catch(()=>{}); if (sliceId) await prisma.claim.deleteMany({ where: { id: sliceId } }).catch(()=>{}); await prisma.clinicalCase.deleteMany({ where: { id: caseId } }).catch(()=>{}); }
    // NB: benefit usage from the committed approval is left as-is (disposable VM).
  }
}

// ─── IP-DEF-04 — same-day bed-day overlap → timeline warning + HIGH alert ─────
async function ipDef04(c: any) {
  if (!c.member) return rec('IP-DEF-04', false, 'no member');
  let caseId = ''; let sliceId = '';
  try {
    const admit = day(clk, -2);
    const cs = await CaseService.openCase({ tenantId: c.tenantId, memberId: c.member.id, providerId: c.noContractProviderId, caseType: 'INPATIENT_ADMISSION', benefitCategory: 'INPATIENT', admissionDate: admit, openedById: c.reviewerId });
    caseId = cs.id;
    const d = day(clk, -1);
    await CaseService.addServiceEntry({ tenantId: c.tenantId, caseId, entryDate: d, category: 'OTHER', serviceCode: 'WARD-GEN', description: 'General ward bed day', quantity: 1, unitAmount: 20_000, enteredById: c.reviewerId });
    await CaseService.addServiceEntry({ tenantId: c.tenantId, caseId, entryDate: d, category: 'OTHER', serviceCode: 'ICU-DAY', description: 'ICU bed day', quantity: 1, unitAmount: 30_000, enteredById: c.reviewerId });
    const warn = await prisma.activityLog.count({ where: { entityId: caseId, action: 'BED_DAY_OVERLAP' } });
    const slice = await CaseService.cutInterimSlice({ tenantId: c.tenantId, caseId, cutoffDate: clk, invoiceNumber: `DEF04-${Date.now()}`, cutById: c.reviewerId });
    sliceId = slice.id;
    const alert = await prisma.claimFraudAlert.findFirst({ where: { claimId: sliceId, rule: 'Overlapping Bed-Day Charges' }, select: { severity: true } });
    // does the fraud gate block approval?
    let gate = 'not-blocked';
    try { await ClaimDecisionService.decide(c.tenantId, sliceId, { action: 'APPROVED', approvedAmount: 50_000, reviewerId: c.reviewerId, matrixSatisfied: true }); }
    catch (e: any) { gate = /fraud/i.test(e.message) ? 'blocked-by-fraud-gate' : `blocked-other(${e.message.slice(0,40)})`; }
    const ok = warn > 0 && alert?.severity === 'HIGH';
    rec('IP-DEF-04', ok, `timeline BED_DAY_OVERLAP=${warn}, slice fraud alert=${alert?.severity ?? 'none'}, approval ${gate}`);
  } catch (e: any) {
    rec('IP-DEF-04', false, `SETUP THREW: ${e?.message ?? e}`);
  } finally {
    if (sliceId) { await prisma.claimFraudAlert.deleteMany({ where: { claimId: sliceId } }).catch(()=>{}); await prisma.adjudicationLog.deleteMany({ where: { claimId: sliceId } }).catch(()=>{}); await prisma.claimLine.deleteMany({ where: { claimId: sliceId } }).catch(()=>{}); }
    if (caseId) { await prisma.activityLog.deleteMany({ where: { entityId: caseId } }).catch(()=>{}); await prisma.caseServiceEntry.deleteMany({ where: { caseId } }).catch(()=>{}); if (sliceId) await prisma.claim.deleteMany({ where: { id: sliceId } }).catch(()=>{}); await prisma.clinicalCase.deleteMany({ where: { id: caseId } }).catch(()=>{}); }
  }
}

// ─── IP-DEF-05 — malformed / unknown-facility HMS batch → friendly errors ─────
async function ipDef05(c: any) {
  const detail: string[] = [];
  // (a) malformed envelope
  let a1 = false, a2 = false;
  try { HmsBatchService.validate({ formatVersion: 2, facilityCode: 'x', batchRef: 'b', entries: [] }); } catch (e: any) { a1 = /formatVersion/i.test(e.message); }
  try { HmsBatchService.validate({ formatVersion: 1, batchRef: 'b', entries: [] }); } catch (e: any) { a2 = /facilityCode/i.test(e.message); }
  detail.push(`validate: badVersion=${a1?'ok':'?'}, missingFacility=${a2?'ok':'?'}`);
  // (b) unknown facility on apply
  let unk = false;
  try { await HmsBatchService.apply(c.tenantId, { formatVersion: 1, facilityCode: 'NO-SUCH-FACILITY-XYZ', batchRef: `UNK-${Date.now()}`, entries: [{ caseNumber: 'CASE-2026-99999', entryDate: '2026-08-01', category: 'OTHER', description: 'x', quantity: 1, unitAmount: 1000 }] }); }
  catch (e: any) { unk = /unknown facility/i.test(e.message); }
  detail.push(`unknownFacility=${unk?'ok':'?'}`);
  // (c) valid+unmatched mix conserves the valid row
  let caseId = ''; let mix = 'n/a';
  try {
    if (c.member) {
      const admit = day(clk, -1);
      const cs = await CaseService.openCase({ tenantId: c.tenantId, memberId: c.member.id, providerId: c.providerId, caseType: 'INPATIENT_ADMISSION', benefitCategory: 'INPATIENT', admissionDate: admit, openedById: c.reviewerId });
      caseId = cs.id;
      const prov = await prisma.provider.findUnique({ where: { id: c.providerId }, select: { name: true } });
      const ref = `MIX-${Date.now()}`;
      const r: any = await HmsBatchService.apply(c.tenantId, { formatVersion: 1, facilityCode: prov!.name, batchRef: ref, entries: [
        { caseNumber: cs.caseNumber, entryDate: '2026-08-01', category: 'OTHER', description: 'valid line', quantity: 1, unitAmount: 15_000 },
        { caseNumber: 'CASE-2026-99999', entryDate: '2026-08-01', category: 'OTHER', description: 'bogus case', quantity: 1, unitAmount: 15_000 },
      ] });
      const entriesOnCase = await prisma.caseServiceEntry.count({ where: { caseId } });
      const exc = await prisma.exceptionLog.count({ where: { tenantId: c.tenantId, reason: 'HMS_BATCH_UNMATCHED', entityId: { contains: ref } } });
      mix = `applied=${r.applied} unmatched=${r.unmatched} (validOnCase=${entriesOnCase}, unmatched->exceptionLog=${exc})`;
      var mixOk = r.applied === 1 && r.unmatched === 1 && entriesOnCase === 1 && exc >= 1;
    }
  } catch (e: any) { mix = `THREW: ${e.message}`; }
  detail.push(`validPlusUnmatched: ${mix}`);
  if (caseId) { await prisma.caseServiceEntry.deleteMany({ where: { caseId } }).catch(()=>{}); await prisma.exceptionLog.deleteMany({ where: { entityRef: { contains: 'MIX-' }, reason: 'HMS_BATCH_UNMATCHED' } }).catch(()=>{}); await prisma.clinicalCase.deleteMany({ where: { id: caseId } }).catch(()=>{}); }
  // @ts-ignore
  const ok = a1 && a2 && unk && (c.member ? mixOk : true);
  rec('IP-DEF-05', ok, detail.join(' | '));
}

// ─── OBS-IP-GL — the GL trial balance nets to zero (debits == credits) ────────
async function obsGl(c: any) {
  try {
    const lines = await prisma.journalLine.findMany({ where: { journalEntry: { tenantId: c.tenantId, isReversed: false } }, select: { debit: true, credit: true } });
    const dr = lines.reduce((s, l) => s + Number(l.debit), 0);
    const cr = lines.reduce((s, l) => s + Number(l.credit), 0);
    const bal = Math.abs(dr - cr) < 0.5;
    rec('OBS-IP-GL', bal, `trial balance over ${lines.length} lines: Σdebit=${dr.toLocaleString()} Σcredit=${cr.toLocaleString()} → ${bal ? 'BALANCED' : 'IMBALANCE ' + (dr - cr)}`);
  } catch (e: any) { rec('OBS-IP-GL', false, `THREW: ${e?.message ?? e}`); }
}

async function main() {
  console.log(`§25 PRIOR-DEFECT GATE — controlled clock ${iso(clk)}\n`);
  const c = await ctx();
  console.log(`ctx: member=${c.member?.memberNumber ?? 'NONE (headroom depleted)'} provider=Kampala Hospital\n`);
  await ipDef01(c);
  await ipDef02(c);
  await ipDef03(c);
  await ipDef04(c);
  await ipDef05(c);
  await obsGl(c);
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n═══ SUMMARY: ${passed}/${results.length} PASS ═══`);
  for (const r of results) console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.id}`);
  await prisma.$disconnect();
  process.exit(passed === results.length ? 0 : 1);
}
main().catch(async (e) => { console.error('GATE ERROR', e); await prisma.$disconnect(); process.exit(2); });
