/**
 * n3-applicability-report.ts (WP-A6, N3 privacy exposure)
 *
 * READ-ONLY. Produces the sign-off artifact for the N3 fix: the six unrelated
 * employers modelled as sibling Groups under one shared "Medvex — Default
 * Client" are all visible to any provider entitled to that Client, because
 * entitlement scopes by Client (ProviderEntitlementService). The entitlement
 * code already supports group-level scoping (a ContractApplicability row with a
 * groupId scopes to that group only) — this is a data change, not a code change.
 *
 * This script lists every provider currently entitled to the Default Client at
 * the client level (groupId = null, INCLUDE, active) and every Group under that
 * Client, then emits a provider×group matrix CSV with an `allowed` column
 * prefilled YES. The business edits `allowed` to YES/NO per pair; the returned
 * CSV feeds n3-apply-group-applicability.ts.
 *
 * Contains NO create/update/delete calls.
 *
 * Usage: npx tsx --env-file=.env scripts/n3-applicability-report.ts \
 *          [--tenant-slug medvex] [--client "Medvex — Default Client"] \
 *          [--out uat/outpatient_vercel/evidence/n3_provider_group_matrix.csv]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { prisma } from "@/lib/prisma";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const TENANT_SLUG = arg("tenant-slug", "medvex");
const CLIENT_NAME = arg("client", "Medvex — Default Client");
const OUT = arg("out", "uat/outpatient_vercel/evidence/n3_provider_group_matrix.csv");

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

async function main() {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: TENANT_SLUG },
    select: { id: true, name: true },
  });
  if (!tenant) throw new Error(`Tenant with slug "${TENANT_SLUG}" not found.`);

  const clients = await prisma.client.findMany({
    where: { operatorTenantId: tenant.id, name: CLIENT_NAME },
    select: { id: true, name: true },
  });
  if (clients.length === 0) throw new Error(`Client "${CLIENT_NAME}" not found under tenant ${TENANT_SLUG}.`);
  if (clients.length > 1) throw new Error(`Client name "${CLIENT_NAME}" is ambiguous (${clients.length} matches).`);
  const client = clients[0];

  // Groups (employers) under the shared client.
  const groups = await prisma.group.findMany({
    where: { clientId: client.id },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const groupCounts = await Promise.all(
    groups.map(async (g) => ({ ...g, members: await prisma.member.count({ where: { groupId: g.id } }) })),
  );

  // Providers entitled to the client at the CLIENT level (groupId = null) via an
  // active INCLUDE applicability on an active contract.
  const clientLevelRows = await prisma.contractApplicability.findMany({
    where: {
      clientId: client.id,
      groupId: null,
      inclusionType: "INCLUDE",
      isActive: true,
      contract: { status: "ACTIVE" },
    },
    select: {
      id: true,
      contractId: true,
      contract: { select: { contractNumber: true, provider: { select: { id: true, name: true } } } },
    },
  });

  // De-duplicate providers (a provider may have several client-level rows).
  const providers = new Map<string, { id: string; name: string }>();
  for (const r of clientLevelRows) {
    providers.set(r.contract.provider.id, { id: r.contract.provider.id, name: r.contract.provider.name });
  }

  console.log(`Tenant:  ${tenant.name} (${tenant.id})`);
  console.log(`Client:  ${client.name} (${client.id})`);
  console.log(`Groups under this client (${groupCounts.length}):`);
  for (const g of groupCounts) console.log(`  - ${g.name} (${g.id}) — ${g.members} members`);
  console.log(`Providers entitled at the CLIENT level (${providers.size}):`);
  for (const p of providers.values()) console.log(`  - ${p.name} (${p.id})`);
  console.log(`Client-level INCLUDE applicability rows: ${clientLevelRows.length}`);

  // Emit the provider × group matrix CSV, allowed prefilled YES.
  const header = ["providerId", "providerName", "groupId", "groupName", "groupMembers", "allowed"];
  const lines = [header.map(csvCell).join(",")];
  for (const p of providers.values()) {
    for (const g of groupCounts) {
      lines.push([p.id, p.name, g.id, g.name, String(g.members), "YES"].map(csvCell).join(","));
    }
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, lines.join("\n") + "\n", "utf8");
  console.log(`\nWrote ${lines.length - 1} provider×group rows to ${OUT}`);
  console.log(`Edit the "allowed" column (YES/NO) per pair, then run n3-apply-group-applicability.ts.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
