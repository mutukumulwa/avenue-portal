/**
 * UAT-HF P03.01 — readiness report for provider entitlement data.
 *
 * DEF-053 (S1): "Point-of-care eligibility returns 'No eligible member found'
 * for every member tested, including members the member portal simultaneously
 * shows as fully covered." Nine probes across three real ACTIVE members, two
 * clients and two packages all returned the identical string — while the member
 * portal showed one of them ACTIVE with UGX 30.0M cover and UGX 0 used.
 * DEF-007 is the same failure seen from the other side: member "Find Care"
 * returned no covered facility at any radius from a register of 195 providers.
 *
 * The mechanism is not a bug in the lookup. `ProviderEntitlementService
 * .entitledMemberWhere` returns `{ id: "__no_provider_entitlement__" }` — a
 * deliberate match-nothing filter — when a provider has **no effective INCLUDE
 * applicability**. A facility with no applicability rows is entitled to no
 * members, so every card number returns not-found, and the UI collapses that
 * into a message blaming the card.
 *
 * So the data, not the code, is what must be fixed first — and this report is
 * the "publish counts and unresolved gaps, apply, rerun to zero" step that has
 * to reach zero **before** fail-closed entitlement enforcement is switched on.
 * Turning enforcement on over incomplete data would convert a wrong answer into
 * a denied one.
 *
 * It writes nothing and has no `--apply`. The seeds and backfills already exist
 * (`prisma/seeds/provider-network.ts`, `scripts/backfill-provider-rbac.ts`,
 * `scripts/seed-provider-practitioners.ts`); this reports whether they have been
 * run and what they left unresolved.
 *
 * Usage:
 *   DATABASE_URL=<url> npx tsx scripts/reports/provider-entitlement-readiness.ts
 *   DATABASE_URL=<url> npx tsx scripts/reports/provider-entitlement-readiness.ts --json
 *
 * Exit code 0 when every active provider is ready, 2 when any gap remains.
 */
import { prisma } from "@/lib/prisma";

interface ProviderReadiness {
  providerId: string;
  name: string;
  status: string;
  branches: number;
  activeContracts: number;
  /** The decisive one: effective INCLUDE applicability on an ACTIVE contract. */
  effectiveIncludeApplicability: number;
  effectiveExcludeApplicability: number;
  scopedUsers: number;
  gaps: string[];
}

async function main(): Promise<void> {
  const asJson = process.argv.includes("--json");
  const now = new Date();

  // Only providers that can actually be used in care. A PENDING provider not
  // appearing in selectors is correct behaviour, not a gap.
  const providers = await prisma.provider.findMany({
    // The field is `contractStatus`, not `status` — a PENDING provider is
    // correctly absent from care selectors, so it is not a gap.
    where: { contractStatus: "ACTIVE" },
    select: {
      id: true,
      name: true,
      contractStatus: true,
      _count: { select: { branches: true, portalUsers: true } },
    },
    orderBy: { name: "asc" },
  });

  const rows: ProviderReadiness[] = [];

  for (const p of providers) {
    const activeContracts = await prisma.providerContract.count({
      where: { providerId: p.id, status: "ACTIVE" },
    });

    // Exactly the predicate ProviderEntitlementService.entitledMemberWhere uses.
    // A report that checks different criteria than the evaluator is worse than
    // no report — it would certify readiness the evaluator disagrees with.
    const applicability = await prisma.contractApplicability.findMany({
      where: {
        isActive: true,
        contract: { providerId: p.id, status: "ACTIVE" },
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
      select: { inclusionType: true },
    });
    const includes = applicability.filter((a) => a.inclusionType !== "EXCLUDE").length;
    const excludes = applicability.length - includes;

    const scopedUsers = await prisma.user.count({ where: { providerId: p.id, isActive: true } });


    const gaps: string[] = [];
    if (p._count.branches === 0) {
      // The product states this itself: "branch-scoped (LISTED) contracts for
      // this provider cannot activate until branches exist."
      gaps.push("no branches");
    }
    if (activeContracts === 0) gaps.push("no ACTIVE contract");
    if (includes === 0) {
      gaps.push("NO EFFECTIVE INCLUDE APPLICABILITY — entitled to zero members (DEF-053)");
    }
    if (scopedUsers === 0) gaps.push("no active provider users");

    rows.push({
      providerId: p.id,
      name: p.name,
      status: p.contractStatus,
      branches: p._count.branches,
      activeContracts,
      effectiveIncludeApplicability: includes,
      effectiveExcludeApplicability: excludes,
      scopedUsers,
      gaps,
    });
  }

  const blocked = rows.filter((r) => r.gaps.length > 0);
  const entitledToNobody = rows.filter((r) => r.effectiveIncludeApplicability === 0);

  if (asJson) {
    console.log(
      JSON.stringify({ generatedAt: now.toISOString(), examined: rows.length, rows }, null, 2),
    );
    process.exitCode = blocked.length > 0 ? 2 : 0;
    return;
  }

  console.log("── Provider entitlement readiness (DEF-053 / DEF-007) ─────────");
  console.log(`Active providers examined:            ${rows.length}`);
  console.log(`Ready (no gaps):                      ${rows.length - blocked.length}`);
  console.log(`With at least one gap:                ${blocked.length}`);
  console.log(`ENTITLED TO ZERO MEMBERS:             ${entitledToNobody.length}`);

  if (entitledToNobody.length > 0) {
    console.log(
      `\nEvery eligibility check against those ${entitledToNobody.length} provider(s) returns\n` +
        `"No eligible member found" for EVERY member, however well covered — because\n` +
        `entitledMemberWhere resolves to a match-nothing filter. That is DEF-053.`,
    );
  }

  if (blocked.length === 0) {
    console.log("\nEvery active provider has branches, an ACTIVE contract, effective INCLUDE");
    console.log("applicability and at least one scoped user. Fail-closed entitlement enforcement");
    console.log("can be enabled safely.");
    return;
  }

  console.log(`\n${blocked.length} provider(s) are not ready:\n`);
  console.log(
    ["PROVIDER", "BRANCH", "CONTRACT", "INCL", "EXCL", "USERS", "GAPS"]
      .map((h, i) => h.padEnd([34, 8, 10, 6, 6, 7, 0][i]))
      .join(""),
  );
  for (const r of blocked) {
    console.log(
      [
        r.name.slice(0, 32).padEnd(34),
        String(r.branches).padEnd(8),
        String(r.activeContracts).padEnd(10),
        String(r.effectiveIncludeApplicability).padEnd(6),
        String(r.effectiveExcludeApplicability).padEnd(6),
        String(r.scopedUsers).padEnd(7),
        r.gaps.join("; "),
      ].join(""),
    );
  }

  console.log(
    "\nResolve with the existing seeds/backfills, then RE-RUN this report until it\n" +
      "reaches zero:\n" +
      "  prisma/seeds/provider-network.ts        branches, contracts, applicability\n" +
      "  scripts/backfill-provider-rbac.ts       provider user scoping\n" +
      "  scripts/seed-provider-practitioners.ts  practitioners and credentials\n" +
      "\nDo NOT enable fail-closed entitlement enforcement while any gap remains:\n" +
      "over incomplete data it converts a wrong answer into a denied one, which is\n" +
      "worse at the point of care.",
  );
  process.exitCode = 2;
}

main()
  .catch((err) => {
    console.error("[provider-entitlement-readiness] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
