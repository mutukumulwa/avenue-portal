/**
 * Switch a provider-access flag on or off for ONE facility — the explicit,
 * audited settings change ProviderAccessSettingsService describes.
 *
 *   dry run   DATABASE_URL=<url> npx tsx scripts/provider-access-flag.ts \
 *               --tenant-id <id> --provider-id <id> --flag tariffCatalog --enable
 *   apply     … --apply --operator-user-id <id> --reason "<why>"
 *   undo      the same with --disable
 *
 * Flags are the per-provider allow-lists in Tenant.config.providerAccess
 * (scripts/lib/provider-access-flag.ts). Only the named list changes: the
 * tenant row is locked, read, and written back with every other key as it was.
 * A change appends a hash-chained PROVIDER_ACCESS_FLAG_CHANGED audit row
 * (before/after list, reason, operator); a no-op writes nothing. The services
 * read the flag on every request, so it takes effect without a deploy.
 *
 * Exit codes: 0 success or no-op · 2 refused · 1 error.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auditChainService } from "@/server/services/audit-chain.service";
import { ProviderAccessSettingsService } from "@/server/services/provider-access-settings.service";
import { isProviderFlag, PROVIDER_FLAG_LISTS, withProviderFlag } from "./lib/provider-access-flag";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (flag: string) => process.argv.includes(`--${flag}`);

class Refused extends Error {}

async function main(): Promise<number> {
  const tenantId = arg("tenant-id");
  const providerId = arg("provider-id");
  const flag = arg("flag");
  if (!tenantId || !providerId) throw new Refused("--tenant-id and --provider-id are required.");
  if (!isProviderFlag(flag)) throw new Refused(`--flag must be one of ${Object.keys(PROVIDER_FLAG_LISTS).join(", ")}.`);
  if (has("enable") === has("disable")) throw new Refused("Choose exactly one of --enable or --disable.");
  const enabled = has("enable");

  const provider = await prisma.provider.findFirst({ where: { id: providerId, tenantId }, select: { id: true, name: true, contractStatus: true } });
  if (!provider) throw new Refused(`Provider ${providerId} not found in tenant ${tenantId}.`);

  if (!has("apply")) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { config: true } });
    if (!tenant) throw new Refused(`Tenant ${tenantId} not found.`);
    const r = withProviderFlag(tenant.config, flag, providerId, enabled);
    console.log(JSON.stringify({ mode: "dry-run", tenantId, provider, flag, list: PROVIDER_FLAG_LISTS[flag], enabled, before: r.before, after: r.after, changed: r.changed }, null, 2));
    return 0;
  }

  const operatorUserId = arg("operator-user-id");
  const reason = (arg("reason") ?? "").trim();
  if (!operatorUserId) throw new Refused("--operator-user-id is required for --apply.");
  if (reason.length < 8) throw new Refused("--reason is required for --apply (at least 8 characters).");
  const operator = await prisma.user.findFirst({ where: { id: operatorUserId, tenantId, isActive: true }, select: { role: true } });
  if (operator?.role !== "SUPER_ADMIN") throw new Refused("--operator-user-id must be an active SUPER_ADMIN of this tenant.");

  const result = await prisma.$transaction(async (tx) => {
    // Lock the row so a concurrent settings change cannot be overwritten.
    await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${tenantId} FOR UPDATE`;
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { config: true } });
    if (!tenant) throw new Refused(`Tenant ${tenantId} not found.`);
    const r = withProviderFlag(tenant.config, flag, providerId, enabled);
    if (r.changed) await tx.tenant.update({ where: { id: tenantId }, data: { config: r.config as Prisma.InputJsonValue } });
    return r;
  });

  if (result.changed) {
    await auditChainService.append({
      actorId: operatorUserId,
      action: "PROVIDER_ACCESS_FLAG_CHANGED",
      module: "SETTINGS",
      entityType: "Tenant",
      entityId: tenantId,
      payload: { flag, list: PROVIDER_FLAG_LISTS[flag], providerId, enabled, before: result.before, after: result.after, reason },
      tenantId,
      description: `Provider access: ${flag} ${enabled ? "enabled" : "disabled"} for provider ${providerId}. ${reason}`,
    });
  }

  // Read back through the service the application uses.
  const settings = await ProviderAccessSettingsService.get(tenantId);
  const live = (settings[PROVIDER_FLAG_LISTS[flag]] as string[]).includes(providerId);
  console.log(JSON.stringify({ mode: "apply", tenantId, provider, flag, enabled, changed: result.changed, before: result.before, after: result.after, liveForProvider: live }, null, 2));
  return live === enabled ? 0 : 1;
}

main()
  .then(async (code) => {
    await prisma.$disconnect();
    process.exit(code);
  })
  .catch(async (err) => {
    await prisma.$disconnect().catch(() => undefined);
    console.error(err instanceof Refused ? `REFUSED: ${err.message}` : err instanceof Error ? err.message : err);
    process.exit(err instanceof Refused ? 2 : 1);
  });
