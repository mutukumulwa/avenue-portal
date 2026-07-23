/**
 * Claims Autopilot — permanent reconciliation & integrity gate (F7.2, §11.7).
 *
 * READ-ONLY. Never repairs anything. Prints every invariant family with its
 * offending references (ids/claim numbers only — no PHI), grouped per tenant,
 * and exits non-zero when any CRITICAL invariant fails — wire it into the
 * integrity cron next to scripts/data-integrity-check.ts.
 *
 * Usage:
 *   npx tsx scripts/claims-autopilot-integrity.ts [--tenant <id>] [--since <ISO date>] [--json]
 */
import { prisma } from "../src/lib/prisma";

type Severity = "CRITICAL" | "WARNING";
interface Finding {
  invariant: string;
  severity: Severity;
  count: number;
  refs: string[]; // bounded, identifier-safe
  detail?: string;
}

const REF_CAP = 25;
const args = process.argv.slice(2);
const argVal = (flag: string): string | undefined => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const tenantFilter = argVal("--tenant");
const since = argVal("--since") ? new Date(argVal("--since")!) : undefined;
const asJson = args.includes("--json");

function cap<T>(rows: T[], toRef: (r: T) => string): { count: number; refs: string[] } {
  return { count: rows.length, refs: rows.slice(0, REF_CAP).map(toRef) };
}

async function run(): Promise<void> {
  const tenants = await prisma.tenant.findMany({
    where: tenantFilter ? { id: tenantFilter } : {},
    select: { id: true, name: true },
  });
  if (tenants.length === 0) {
    console.error("No tenants matched.");
    process.exit(2);
  }

  let criticalTotal = 0;
  const report: Record<string, Finding[]> = {};

  for (const tenant of tenants) {
    const t = tenant.id;
    const createdScope = since ? { createdAt: { gte: since } } : {};
    const findings: Finding[] = [];
    const add = (invariant: string, severity: Severity, rows: { count: number; refs: string[] }, detail?: string) => {
      if (rows.count === 0) return;
      findings.push({ invariant, severity, ...rows, detail });
      if (severity === "CRITICAL") criticalTotal += rows.count;
    };

    // 1. accepted receipt -> exactly one linked claim
    add(
      "accepted receipt -> linked claim",
      "CRITICAL",
      cap(
        await prisma.claimIntakeReceipt.findMany({
          where: { tenantId: t, state: "SUCCEEDED", claimId: null, ...createdScope },
          select: { id: true },
        }),
        (r) => r.id,
      ),
    );

    // 2. successful claim receipt -> at least the initial processing run
    add(
      "claim with receipt -> processing run",
      "CRITICAL",
      cap(
        await prisma.claim.findMany({
          where: { tenantId: t, intakeReceipts: { some: {} }, processingRuns: { none: {} }, ...createdScope },
          select: { claimNumber: true },
        }),
        (r) => r.claimNumber,
      ),
    );

    // 3. nonterminal runs hold valid lease/retry state (stale > 30 min = finding)
    add(
      "nonterminal run stale >30min",
      "WARNING",
      cap(
        await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "ClaimProcessingRun"
          WHERE "tenantId" = ${t}
            AND state IN ('PENDING','RETRYABLE','RUNNING')
            AND "updatedAt" < (now() AT TIME ZONE 'UTC') - interval '30 minutes'
          LIMIT 200`,
        (r) => r.id,
      ),
      "sweeper should have picked these up — check the worker",
    );

    // 4. terminal run -> terminal fields coherent
    add(
      "terminal run without completedAt",
      "CRITICAL",
      cap(
        await prisma.claimProcessingRun.findMany({
          where: { tenantId: t, state: { in: ["ROUTED", "SHADOW_COMPLETE", "AUTO_DECIDED", "FAILED"] }, completedAt: null },
          select: { id: true },
        }),
        (r) => r.id,
      ),
    );

    // 5. claim billed == Σ line billed (canonical claims only — they always carry lines)
    add(
      "claim billed != Σ line billed",
      "CRITICAL",
      cap(
        await prisma.$queryRaw<Array<{ claimNumber: string }>>`
          SELECT c."claimNumber"
          FROM "Claim" c
          JOIN "ClaimLine" l ON l."claimId" = c.id
          WHERE c."tenantId" = ${t} AND c."intakeSchemaVersion" IS NOT NULL
          GROUP BY c.id, c."claimNumber", c."billedAmount"
          HAVING abs(c."billedAmount" - sum(l."billedAmount")) > 0.01
          LIMIT 200`,
        (r) => r.claimNumber,
      ),
    );

    // 6. approved claim: approved == Σ line approved allocation (when lines are stamped)
    add(
      "approved != Σ line approved (stamped lines)",
      "WARNING",
      cap(
        await prisma.$queryRaw<Array<{ claimNumber: string }>>`
          SELECT c."claimNumber"
          FROM "Claim" c
          JOIN "ClaimLine" l ON l."claimId" = c.id
          WHERE c."tenantId" = ${t}
            AND c.status IN ('APPROVED','PARTIALLY_APPROVED')
            AND c."intakeSchemaVersion" IS NOT NULL
          GROUP BY c.id, c."claimNumber", c."approvedAmount"
          HAVING count(*) FILTER (WHERE l."adjudicationDecision" IS NOT NULL) > 0
             AND abs(c."approvedAmount" - sum(coalesce(l."approvedAmount", 0))) > 0.01
          LIMIT 200`,
        (r) => r.claimNumber,
      ),
      "line stamping should conserve the claim decision (D11)",
    );

    // 7-9. automatic decisions: policy exists + within its ceiling + no open fraud
    add(
      "auto-decided without an APPROVED policy version",
      "CRITICAL",
      cap(
        await prisma.$queryRaw<Array<{ claimNumber: string }>>`
          SELECT c."claimNumber"
          FROM "Claim" c
          JOIN "ClaimProcessingRun" r ON r."claimId" = c.id AND r.state = 'AUTO_DECIDED'
          WHERE c."tenantId" = ${t}
            AND NOT EXISTS (
              SELECT 1 FROM "AutoAdjudicationPolicy" p
              WHERE p."tenantId" = ${t} AND p.status = 'APPROVED'
            )
          LIMIT 200`,
        (r) => r.claimNumber,
      ),
    );
    add(
      "auto-decided above every approved policy ceiling",
      "CRITICAL",
      cap(
        await prisma.$queryRaw<Array<{ claimNumber: string }>>`
          SELECT c."claimNumber"
          FROM "Claim" c
          JOIN "ClaimProcessingRun" r ON r."claimId" = c.id AND r.state = 'AUTO_DECIDED'
          WHERE c."tenantId" = ${t}
            AND c."approvedAmount" > (
              SELECT coalesce(max(p."maxAutoApproveAmount"), 0)
              FROM "AutoAdjudicationPolicy" p
              WHERE p."tenantId" = ${t} AND p.status = 'APPROVED'
            )
          LIMIT 200`,
        (r) => r.claimNumber,
      ),
      "compared against the LARGEST approved ceiling (per-scope refinement in the console)",
    );
    add(
      "auto-decided with an unresolved fraud alert",
      "CRITICAL",
      cap(
        await prisma.$queryRaw<Array<{ claimNumber: string }>>`
          SELECT DISTINCT c."claimNumber"
          FROM "Claim" c
          JOIN "ClaimProcessingRun" r ON r."claimId" = c.id AND r.state = 'AUTO_DECIDED'
          JOIN "ClaimFraudAlert" f ON f."claimId" = c.id AND f.resolved = false
          WHERE c."tenantId" = ${t}
          LIMIT 200`,
        (r) => r.claimNumber,
      ),
    );

    // 10. strong fingerprint uniqueness (DB-enforced; verify anyway)
    add(
      "duplicate strong event fingerprints",
      "CRITICAL",
      cap(
        await prisma.$queryRaw<Array<{ strongEventFingerprint: string }>>`
          SELECT "strongEventFingerprint"
          FROM "Claim"
          WHERE "tenantId" = ${t} AND "strongEventFingerprint" IS NOT NULL
          GROUP BY "strongEventFingerprint"
          HAVING count(*) > 1
          LIMIT 50`,
        (r) => r.strongEventFingerprint.slice(0, 24),
      ),
    );

    // 11. case entries: exactly one billing owner, owner not VOID while entry stays billed
    add(
      "case entry billed on a VOID claim (stranded freeze)",
      "WARNING",
      cap(
        await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT e.id
          FROM "CaseServiceEntry" e
          JOIN "Claim" c ON c.id = e."billedInClaimId"
          WHERE c."tenantId" = ${t} AND c.status = 'VOID' AND e.voided = false
          LIMIT 200`,
        (r) => r.id,
      ),
      "void of a slice should release or re-bill its entries",
    );

    // 12. offline op SYNCED -> receipt + result claim exist
    add(
      "SYNCED offline op without receipt/result linkage",
      "CRITICAL",
      cap(
        await prisma.syncOperation.findMany({
          where: {
            tenantId: t,
            entityType: "Claim",
            state: "SYNCED",
            ...createdScope,
            OR: [{ resultClaimId: null }, { receiptId: null }],
            // legacy ops (pre-F5.5) have neither column populated — only flag ops
            // synced after the linkage columns shipped
            syncedAt: { gte: new Date("2026-07-23T00:00:00Z") },
          },
          select: { opKey: true },
        }),
        (r) => r.opKey,
      ),
    );

    report[`${tenant.name} (${t})`] = findings;
  }

  if (asJson) {
    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), since: since?.toISOString() ?? null, report }, null, 2));
  } else {
    console.log(`Claims Autopilot integrity report — ${new Date().toISOString()}${since ? ` (since ${since.toISOString()})` : ""}`);
    for (const [tenant, findings] of Object.entries(report)) {
      console.log(`\n■ ${tenant}`);
      if (findings.length === 0) {
        console.log("  ✓ all invariants hold");
        continue;
      }
      for (const f of findings) {
        console.log(`  ${f.severity === "CRITICAL" ? "✗ CRITICAL" : "⚠ WARNING "} ${f.invariant} — ${f.count} offender(s)`);
        if (f.detail) console.log(`      ${f.detail}`);
        console.log(`      refs: ${f.refs.join(", ")}${f.count > f.refs.length ? ` … (+${f.count - f.refs.length})` : ""}`);
      }
    }
    console.log(`\n${criticalTotal === 0 ? "✓ NO CRITICAL FINDINGS" : `✗ ${criticalTotal} CRITICAL offender(s)`}`);
  }
  process.exit(criticalTotal === 0 ? 0 : 1);
}

run()
  .catch((err) => {
    console.error("integrity run failed:", err);
    process.exit(2);
  })
  .finally(() => prisma.$disconnect());
