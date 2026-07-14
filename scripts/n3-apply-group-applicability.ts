/**
 * n3-apply-group-applicability.ts (WP-A6, N3 privacy exposure)
 *
 * Converts CLIENT-level provider entitlement on the shared "Medvex — Default
 * Client" into GROUP-level entitlement, so a provider only resolves member PII
 * for the employers (groups) it is contracted to serve. Driven by the signed-off
 * CSV produced by n3-applicability-report.ts (allowed = YES/NO per provider×group).
 *
 * For each active client-level INCLUDE applicability row (groupId = null), inside
 * ONE transaction per contract:
 *   1. Create one group-level INCLUDE applicability row per YES group for that
 *      provider (same contractId/clientId, groupId set, effective dates copied).
 *   2. Deactivate the client-level row (isActive = false) — never deleted, for
 *      audit. Refuses this if the CSV grants the provider zero groups unless
 *      --allow-total-revoke is passed.
 *
 * Idempotent: a pair that already has an active group-level row is skipped.
 * DRY-RUN by default: prints the intended writes and exits. Pass --apply to write.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/n3-apply-group-applicability.ts --csv <path>            # dry run
 *   npx tsx --env-file=.env scripts/n3-apply-group-applicability.ts --csv <path> --apply    # write
 *   ... [--allow-total-revoke]
 */
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const CSV = arg("csv");
const APPLY = process.argv.includes("--apply");
const ALLOW_TOTAL_REVOKE = process.argv.includes("--allow-total-revoke");

type Row = { providerId: string; groupId: string; groupName: string; allowed: boolean };

function parseCsv(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = lines[0].split(",").map((h) => h.trim());
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`CSV missing required column "${name}". Header: ${header.join(", ")}`);
    return i;
  };
  const pi = col("providerId");
  const gi = col("groupId");
  const gni = col("groupName");
  const ai = col("allowed");
  return lines.slice(1).map((l) => {
    // Simple CSV: values here never contain commas except quoted names, but the
    // key columns (ids, allowed) are unquoted, so a naive split is sufficient
    // for the ids; re-join the remainder for the name is unnecessary here.
    const cells = l.split(",");
    return {
      providerId: cells[pi].trim(),
      groupId: cells[gi].trim(),
      groupName: cells[gni]?.trim() ?? "",
      allowed: /^yes$/i.test(cells[ai]?.trim() ?? ""),
    };
  });
}

async function main() {
  if (!CSV) throw new Error("Pass --csv <path> (the signed-off matrix from n3-applicability-report.ts).");
  const rows = parseCsv(readFileSync(CSV, "utf8"));

  // Validate every id in the CSV exists before writing anything.
  const providerIds = [...new Set(rows.map((r) => r.providerId))];
  const groupIds = [...new Set(rows.map((r) => r.groupId))];
  const foundProviders = new Set((await prisma.provider.findMany({ where: { id: { in: providerIds } }, select: { id: true } })).map((p) => p.id));
  const foundGroups = new Set((await prisma.group.findMany({ where: { id: { in: groupIds } }, select: { id: true } })).map((g) => g.id));
  const missingP = providerIds.filter((id) => !foundProviders.has(id));
  const missingG = groupIds.filter((id) => !foundGroups.has(id));
  if (missingP.length) throw new Error(`CSV references unknown providerId(s): ${missingP.join(", ")}`);
  if (missingG.length) throw new Error(`CSV references unknown groupId(s): ${missingG.join(", ")}`);

  const allowedByProvider = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!allowedByProvider.has(r.providerId)) allowedByProvider.set(r.providerId, new Set());
    if (r.allowed) allowedByProvider.get(r.providerId)!.add(r.groupId);
  }

  console.log(`Mode: ${APPLY ? "APPLY (writing)" : "DRY RUN (no writes)"}`);

  for (const [providerId, allowedGroups] of allowedByProvider) {
    // Active client-level INCLUDE rows for this provider (the rows to split).
    const clientLevelRows = await prisma.contractApplicability.findMany({
      where: {
        groupId: null,
        inclusionType: "INCLUDE",
        isActive: true,
        contract: { providerId, status: "ACTIVE" },
      },
      select: { id: true, contractId: true, clientId: true, versionId: true, packageId: true, effectiveFrom: true, effectiveTo: true },
    });
    if (clientLevelRows.length === 0) {
      console.log(`  provider ${providerId}: no active client-level INCLUDE rows — nothing to split.`);
      continue;
    }
    if (allowedGroups.size === 0 && !ALLOW_TOTAL_REVOKE) {
      throw new Error(
        `Provider ${providerId} is granted ZERO groups by the CSV. This would revoke all access. ` +
          `Re-check the CSV, or pass --allow-total-revoke to proceed intentionally.`,
      );
    }

    for (const clRow of clientLevelRows) {
      // Existing active group-level rows on this contract+client (idempotency).
      const existing = await prisma.contractApplicability.findMany({
        where: {
          contractId: clRow.contractId,
          clientId: clRow.clientId,
          groupId: { in: [...allowedGroups] },
          inclusionType: "INCLUDE",
          isActive: true,
        },
        select: { groupId: true },
      });
      const already = new Set(existing.map((e) => e.groupId));
      const toCreate = [...allowedGroups].filter((gid) => !already.has(gid));

      console.log(
        `  provider ${providerId} · contract ${clRow.contractId}: ` +
          `create ${toCreate.length} group row(s) [${toCreate.join(", ") || "none"}], ` +
          `deactivate client-level row ${clRow.id}` +
          (already.size ? ` (skipping ${already.size} already-present)` : ""),
      );

      if (!APPLY) continue;

      await prisma.$transaction(async (tx) => {
        for (const gid of toCreate) {
          await tx.contractApplicability.create({
            data: {
              contractId: clRow.contractId,
              clientId: clRow.clientId,
              groupId: gid,
              versionId: clRow.versionId,
              packageId: clRow.packageId,
              inclusionType: "INCLUDE",
              isActive: true,
              effectiveFrom: clRow.effectiveFrom,
              effectiveTo: clRow.effectiveTo,
            },
          });
        }
        await tx.contractApplicability.update({
          where: { id: clRow.id },
          data: { isActive: false },
        });
      });
    }
  }

  console.log(APPLY ? "\nDone (applied)." : "\nDry run complete — re-run with --apply to write.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
