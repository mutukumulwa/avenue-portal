/**
 * Provider practitioner + credential seed  (ELIG-GAP-021 companion, Phase 4).
 *
 * Phase 4 hardened the preauth auto-decision: the PRACTITIONER_CREDENTIAL gate no
 * longer passes on absent data — a provider with no active, unexpired practitioner
 * credential now routes every auto-decision to human. This step populates the
 * practitioner/credential data so legitimate providers auto-approve again.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DATA SOURCE (choose one)
 *   --file <path.json>   The REAL credentialed clinicians per facility (preferred,
 *                        REQUIRED for production). JSON array of PractitionerEntry:
 *        [
 *          { "providerName": "Aga Khan University Hospital",   // or "providerId"
 *            "firstName": "Jane", "lastName": "Doe",
 *            "licenseType": "MEDICAL",                          // free string
 *            "licenseNumber": "UMDPC-12345",                    // unique per tenant
 *            "documentType": "PRACTISING_LICENCE",              // optional
 *            "issueDate": "2026-01-01",                         // optional
 *            "expiryDate": "2027-12-31",                        // REQUIRED, future
 *            "isPrimary": true }                                // optional
 *        ]
 *
 *   (no --file)          SYNTHETIC PLACEHOLDER mode — one placeholder practitioner
 *                        per provider that lacks a valid credential. Placeholders
 *                        fabricate credential data, which is exactly what the
 *                        GAP-021 gate exists to reject, so they are REFUSED unless
 *                        --allow-placeholder is passed. NEVER use placeholders in
 *                        production: the gate routing to human is the safe default;
 *                        make it auto-approve only against REAL credentials.
 *
 * FLAGS
 *   --apply              Write. Without it, dry-run (reports, writes nothing).
 *   --allow-placeholder  Permit synthetic placeholder creation (dev/UAT only).
 *   --tenant <id>        Restrict to one tenant (default: all tenants).
 *   --only-uncredentialed With --file too: skip providers that already have a
 *                        valid credential (default: apply every file entry).
 *
 * Idempotent by (tenantId, licenseNumber) and the (providerId, practitionerId) join.
 *
 * Usage:
 *   npx tsx scripts/seed-provider-practitioners.ts --file practitioners.json          # dry-run
 *   npx tsx scripts/seed-provider-practitioners.ts --file practitioners.json --apply  # write real data
 *   npx tsx scripts/seed-provider-practitioners.ts --apply --allow-placeholder        # dev/UAT synthetic
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { prisma } from '../src/lib/prisma';
import { parseValidDate } from '../src/lib/dates';

const APPLY = process.argv.includes('--apply');
const ALLOW_PLACEHOLDER = process.argv.includes('--allow-placeholder');
const ONLY_UNCREDENTIALED = process.argv.includes('--only-uncredentialed');
const fileArg = (() => {
  const i = process.argv.indexOf('--file');
  return i >= 0 ? process.argv[i + 1] : undefined;
})();
const tenantArg = (() => {
  const i = process.argv.indexOf('--tenant');
  return i >= 0 ? process.argv[i + 1] : undefined;
})();

interface PractitionerEntry {
  providerId?: string;
  providerName?: string;
  firstName: string;
  lastName: string;
  licenseType: string;
  licenseNumber: string;
  documentType?: string;
  issueDate?: string;
  expiryDate: string;
  isPrimary?: boolean;
  phone?: string;
  email?: string;
}

/** The gate's own predicate: does this provider have an active, unexpired credential? */
async function providerHasValidCredential(providerId: string, now: Date): Promise<boolean> {
  const hit = await prisma.providerPractitioner.findFirst({
    where: { providerId, practitioner: { credentials: { some: { status: 'ACTIVE', expiryDate: { gt: now } } } } },
    select: { providerId: true },
  });
  return !!hit;
}

/** Create/reuse Practitioner + ensure an ACTIVE unexpired credential + link to the provider. Idempotent. */
async function ensurePractitioner(
  tenantId: string,
  providerId: string,
  e: { firstName: string; lastName: string; licenseType: string; licenseNumber: string; documentType: string; issueDate: Date | null; expiryDate: Date; isPrimary: boolean; phone?: string; email?: string; placeholder: boolean },
): Promise<{ created: boolean }> {
  let practitioner = await prisma.practitioner.findFirst({ where: { tenantId, licenseNumber: e.licenseNumber }, select: { id: true } });
  let createdSomething = false;

  if (!practitioner) {
    if (APPLY) {
      practitioner = await prisma.practitioner.create({
        data: { tenantId, firstName: e.firstName, lastName: e.lastName, licenseType: e.licenseType, licenseNumber: e.licenseNumber, phone: e.phone ?? null, email: e.email ?? null },
        select: { id: true },
      });
    }
    createdSomething = true;
  }

  // Ensure an ACTIVE, unexpired credential exists.
  if (practitioner) {
    const hasCred = await prisma.practitionerCredential.findFirst({
      where: { practitionerId: practitioner.id, status: 'ACTIVE', expiryDate: { gt: new Date() } },
      select: { id: true },
    });
    if (!hasCred && APPLY) {
      await prisma.practitionerCredential.create({
        data: {
          practitionerId: practitioner.id,
          documentType: e.documentType,
          status: 'ACTIVE',
          issueDate: e.issueDate,
          expiryDate: e.expiryDate,
          notes: e.placeholder ? 'PLACEHOLDER — replace with the real practising credential.' : null,
        },
      });
      createdSomething = true;
    }

    // Ensure the provider↔practitioner link.
    const link = await prisma.providerPractitioner.findUnique({
      where: { providerId_practitionerId: { providerId, practitionerId: practitioner.id } },
      select: { providerId: true },
    });
    if (!link && APPLY) {
      await prisma.providerPractitioner.create({ data: { providerId, practitionerId: practitioner.id, isPrimary: e.isPrimary } });
      createdSomething = true;
    }
  }

  return { created: createdSomething };
}

async function main() {
  const mode = APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)';
  console.log(`\n🩺 Provider practitioner/credential seed — ${mode}${fileArg ? ` — file: ${fileArg}` : ' — SYNTHETIC placeholder mode'}\n`);
  const now = new Date();
  const summary = { providersTouched: 0, practitionersCreated: 0, skippedHadCredential: 0, placeholders: 0, errors: [] as string[] };

  const tenants = await prisma.tenant.findMany({ where: tenantArg ? { id: tenantArg } : {}, select: { id: true, name: true } });

  if (fileArg) {
    // ── REAL-DATA mode ───────────────────────────────────────────────────────
    const entries = JSON.parse(readFileSync(fileArg, 'utf8')) as PractitionerEntry[];
    if (!Array.isArray(entries)) throw new Error('--file must contain a JSON array');

    for (const raw of entries) {
      const expiry = parseValidDate(raw.expiryDate);
      if (!expiry) { summary.errors.push(`${raw.licenseNumber}: invalid expiryDate "${raw.expiryDate}"`); continue; }
      if (expiry <= now) { summary.errors.push(`${raw.licenseNumber}: expiryDate is not in the future`); continue; }

      // Resolve the provider within the (single or specified) tenant set.
      const provider = raw.providerId
        ? await prisma.provider.findFirst({ where: { id: raw.providerId, ...(tenantArg ? { tenantId: tenantArg } : {}) }, select: { id: true, tenantId: true, name: true } })
        : await prisma.provider.findFirst({ where: { name: raw.providerName, ...(tenantArg ? { tenantId: tenantArg } : {}) }, select: { id: true, tenantId: true, name: true } });
      if (!provider) { summary.errors.push(`${raw.licenseNumber}: provider not found (${raw.providerId ?? raw.providerName})`); continue; }

      if (ONLY_UNCREDENTIALED && (await providerHasValidCredential(provider.id, now))) { summary.skippedHadCredential++; continue; }

      const { created } = await ensurePractitioner(provider.tenantId, provider.id, {
        firstName: raw.firstName, lastName: raw.lastName, licenseType: raw.licenseType, licenseNumber: raw.licenseNumber,
        documentType: raw.documentType ?? 'PRACTISING_LICENCE', issueDate: parseValidDate(raw.issueDate), expiryDate: expiry,
        isPrimary: raw.isPrimary ?? false, phone: raw.phone, email: raw.email, placeholder: false,
      });
      if (created) { summary.providersTouched++; summary.practitionersCreated++; }
    }
  } else {
    // ── SYNTHETIC PLACEHOLDER mode ───────────────────────────────────────────
    if (!ALLOW_PLACEHOLDER) {
      console.log('⛔ Placeholder mode is disabled. Provide real data with --file, or pass --allow-placeholder');
      console.log('   (dev/UAT only) to fabricate synthetic credentials. NEVER use placeholders in production —');
      console.log('   the gate routing to human is the safe default; auto-approve only against REAL credentials.\n');
      await prisma.$disconnect();
      return;
    }
    const expiry = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    for (const t of tenants) {
      const providers = await prisma.provider.findMany({ where: { tenantId: t.id }, select: { id: true, name: true } });
      for (const p of providers) {
        if (await providerHasValidCredential(p.id, now)) { summary.skippedHadCredential++; continue; }
        const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const { created } = await ensurePractitioner(t.id, p.id, {
          firstName: 'Placeholder', lastName: `Clinician — ${p.name}`.slice(0, 60),
          licenseType: 'MEDICAL', licenseNumber: `PLACEHOLDER-${slug}-001`.slice(0, 60).toUpperCase(),
          documentType: 'PRACTISING_LICENCE', issueDate: now, expiryDate: expiry, isPrimary: true, placeholder: true,
        });
        if (created) { summary.providersTouched++; summary.practitionersCreated++; summary.placeholders++; }
      }
    }
  }

  console.log('──────────── SUMMARY ────────────');
  console.log(`Providers touched:            ${summary.providersTouched}`);
  console.log(`Practitioners/credentials:    ${summary.practitionersCreated}`);
  console.log(`Skipped (already credentialed): ${summary.skippedHadCredential}`);
  if (summary.placeholders) console.log(`\n⚠️  ${summary.placeholders} PLACEHOLDER credentials — replace with real practising credentials.`);
  if (summary.errors.length) { console.log(`\n❌ Errors (${summary.errors.length}):`); for (const e of summary.errors) console.log(`   • ${e}`); }
  if (!APPLY) console.log('\nDRY RUN — re-run with --apply to write.');
  console.log('─────────────────────────────────');
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(String(e).slice(0, 400)); await prisma.$disconnect(); process.exit(1); });
