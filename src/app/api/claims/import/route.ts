import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ClaimIntakeService } from "@/server/services/claim-intake/intake.service";
import { IntakeError } from "@/server/services/claim-intake/errors";
import { ProvidersService } from "@/server/services/providers.service";

/**
 * Bulk claims import (F5.4) — an adapter over the canonical ClaimIntakeService.
 *
 * - `mode=preview` validates the file and EVERY row without creating anything.
 * - Commit submits each valid row with the durable key
 *   `csv:<fileSha256₁₆>:<sheet>:<row>:<providerId>` (channel CSV_IMPORT,
 *   source BATCH) — re-uploading the same file REPLAYS row-by-row and creates
 *   zero additional claims; a row whose invoice already exists on any rail
 *   LINKS to that claim (§8.3.1) instead of duplicating.
 * - Per-row terminal disposition + receipt reference; partial success is
 *   explicit; a conservation block ties file total = imported + replayed +
 *   linked + skipped.
 * - Business gates (member status / coverage / benefit) are NOT import errors:
 *   the claim is accepted and routed (D6). Rows are skipped only for
 *   structural problems (unresolvable member/provider, bad amount/date).
 */
const MAX_SIZE_BYTES = 10 * 1024 * 1024;
// Bounded row count (route files may only export handlers, so tests mirror this value).
const MAX_IMPORT_ROWS = 2000;
const ALLOWED_EXTENSIONS = [".xlsx", ".xls"];
const CLINICAL_ROLES = ["SUPER_ADMIN", "CLAIMS_OFFICER", "MEDICAL_OFFICER"];

type RowError = { row: number; memberNumber?: string; providerName?: string; invoiceNumber?: string; errors: string[] };
type RowResult = {
  row: number;
  outcome: "IMPORTED" | "REPLAYED" | "LINKED" | "VALID"; // VALID = preview only
  claimNumber: string | null;
  receiptId: string | null;
  memberNumber: string;
  providerName: string;
  billedAmount: number;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cellText(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value && typeof value === "object") {
    if ("text" in value) return String((value as { text?: unknown }).text ?? "").trim();
    if ("result" in value) return String((value as { result?: unknown }).result ?? "").trim();
  }
  return String(value ?? "").trim();
}

function parseServiceDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const raw = cellText(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

interface Conservation {
  fileTotal: number;
  importedTotal: number;
  replayedTotal: number;
  linkedTotal: number;
  skippedTotal: number;
}

function renderSummary(preview: boolean, results: RowResult[], errors: RowError[], c: Conservation) {
  const label = (o: RowResult["outcome"]) =>
    o === "IMPORTED" ? "Imported" : o === "REPLAYED" ? "Replayed (already imported)" : o === "LINKED" ? "Linked to existing claim" : "Valid (not imported — preview)";
  const resultRows = results
    .map(
      (item) => `
    <tr>
      <td>${item.row}</td>
      <td>${label(item.outcome)}</td>
      <td>${item.claimNumber ? `<a href="/claims?search=${encodeURIComponent(item.claimNumber)}">${escapeHtml(item.claimNumber)}</a>` : "—"}</td>
      <td class="mono">${escapeHtml(item.receiptId ?? "—")}</td>
      <td>${escapeHtml(item.memberNumber)}</td>
      <td>${escapeHtml(item.providerName)}</td>
      <td class="num">${item.billedAmount.toLocaleString("en-UG")}</td>
    </tr>
  `,
    )
    .join("");

  const errorRows = errors
    .map(
      (item) => `
    <tr>
      <td>${item.row}</td>
      <td>${escapeHtml(item.memberNumber)}</td>
      <td>${escapeHtml(item.providerName)}</td>
      <td>${escapeHtml(item.invoiceNumber)}</td>
      <td>${escapeHtml(item.errors.join("; "))}</td>
    </tr>
  `,
    )
    .join("");

  const conserved = Math.abs(c.fileTotal - (c.importedTotal + c.replayedTotal + c.linkedTotal + c.skippedTotal)) < 0.01;

  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Bulk Claims Import</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 32px; color: #212529; background: #f8f9fa; }
          main { max-width: 1150px; margin: 0 auto; background: #fff; border: 1px solid #eee; border-radius: 8px; padding: 24px; }
          h1 { margin: 0 0 8px; color: #0B1437; }
          .summary { display: flex; gap: 16px; margin: 20px 0; flex-wrap: wrap; }
          .pill { border: 1px solid #eee; border-radius: 8px; padding: 12px 16px; min-width: 150px; }
          .count { font-size: 28px; font-weight: 700; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px; }
          th, td { border-bottom: 1px solid #eee; text-align: left; padding: 10px; vertical-align: top; }
          th { background: #eef2f4; color: #6c757d; font-size: 12px; text-transform: uppercase; }
          .num { text-align: right; font-variant-numeric: tabular-nums; }
          .mono { font-family: ui-monospace, monospace; font-size: 12px; }
          a { color: #058a80; font-weight: 700; text-decoration: none; }
          .actions { margin-top: 24px; display: flex; gap: 12px; }
          .button { display: inline-block; border-radius: 999px; padding: 10px 16px; background: #0B1437; color: #fff; }
          .secondary { background: #fff; color: #0B1437; border: 1px solid #0B1437; }
          .conservation { margin-top: 16px; padding: 12px 16px; border-radius: 8px; border: 1px solid ${conserved ? "#28A745" : "#DC3545"}; }
        </style>
      </head>
      <body>
        <main>
          <h1>${preview ? "Bulk Claims Import — Preview (nothing created)" : "Bulk Claims Import Complete"}</h1>
          <p>${preview ? "Every row was validated; NO claims were created. Re-submit without preview to import." : "Valid rows were accepted through the canonical intake (receipt per row). Rows with structural errors were skipped; eligibility/benefit issues route for review on the claim itself."}</p>
          <div class="summary">
            <div class="pill"><div class="count">${results.filter((r) => r.outcome !== "VALID").length || (preview ? results.length : 0)}</div><div>${preview ? "Valid rows" : "Accepted"}</div></div>
            <div class="pill"><div class="count">${results.filter((r) => r.outcome === "REPLAYED").length}</div><div>Replayed</div></div>
            <div class="pill"><div class="count">${results.filter((r) => r.outcome === "LINKED").length}</div><div>Linked</div></div>
            <div class="pill"><div class="count">${errors.length}</div><div>Skipped</div></div>
          </div>
          <div class="conservation">
            <strong>Conservation:</strong> file total ${c.fileTotal.toLocaleString("en-UG")}
            = imported ${c.importedTotal.toLocaleString("en-UG")}
            + replayed ${c.replayedTotal.toLocaleString("en-UG")}
            + linked ${c.linkedTotal.toLocaleString("en-UG")}
            + skipped ${c.skippedTotal.toLocaleString("en-UG")}
            — ${conserved ? "CONSERVED ✓" : "MISMATCH ✗ (investigate before relying on this import)"}
          </div>
          <h2>${preview ? "Validated Rows" : "Accepted Claims"}</h2>
          <table>
            <thead><tr><th>Row</th><th>Outcome</th><th>Claim</th><th>Receipt</th><th>Member</th><th>Provider</th><th class="num">Billed</th></tr></thead>
            <tbody>${resultRows || '<tr><td colspan="7">None.</td></tr>'}</tbody>
          </table>
          <h2>Skipped Rows</h2>
          <table>
            <thead><tr><th>Row</th><th>Member</th><th>Provider</th><th>Invoice</th><th>Reason</th></tr></thead>
            <tbody>${errorRows || '<tr><td colspan="5">No errors.</td></tr>'}</tbody>
          </table>
          <div class="actions">
            <a class="button" href="/claims">Back to Claims</a>
            <a class="button secondary" href="/claims/import">Import Another File</a>
          </div>
        </main>
      </body>
    </html>`;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!CLINICAL_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const preview = cellText(formData.get("mode")).toLowerCase() === "preview";
  const wantJson = cellText(formData.get("format")).toLowerCase() === "json";
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const lowerName = file.name.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
    return NextResponse.json({ error: "Upload an .xlsx or .xls file." }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File exceeds 10 MB limit." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileSha = createHash("sha256").update(buffer).digest("hex");

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return NextResponse.json({ error: "Workbook has no worksheets" }, { status: 400 });
  }
  if (sheet.rowCount - 1 > MAX_IMPORT_ROWS) {
    return NextResponse.json(
      { error: `File has ${sheet.rowCount - 1} data rows — the limit is ${MAX_IMPORT_ROWS}. Split the file and import in parts.` },
      { status: 400 },
    );
  }

  const tenantId = session.user.tenantId;
  const results: RowResult[] = [];
  const errors: RowError[] = [];
  const conservation: Conservation = { fileTotal: 0, importedTotal: 0, replayedTotal: 0, linkedTotal: 0, skippedTotal: 0 };
  let acceptedCount = 0;

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const memberNumber = cellText(row.getCell(1).value);
    const providerName = cellText(row.getCell(2).value);
    const serviceDate = parseServiceDate(row.getCell(3).value);
    const diagnosisCode = cellText(row.getCell(4).value);
    const cptCode = cellText(row.getCell(5).value);
    const billedAmount = Number(cellText(row.getCell(6).value).replace(/,/g, ""));
    const invoiceNumber = cellText(row.getCell(7).value);

    if (!memberNumber && !providerName && !serviceDate && !diagnosisCode && !cptCode && !billedAmount && !invoiceNumber) {
      continue; // fully blank row
    }
    const rowBilled = Number.isFinite(billedAmount) && billedAmount > 0 ? billedAmount : 0;
    conservation.fileTotal += rowBilled;

    // Structural row validation (preview parity with the canonical boundary).
    const rowErrors: string[] = [];
    if (!memberNumber) rowErrors.push("MemberNumber is required");
    if (!providerName) rowErrors.push("ProviderName is required");
    if (!serviceDate) rowErrors.push("DateOfService must be a valid date");
    if (!Number.isFinite(billedAmount) || billedAmount <= 0) rowErrors.push("BilledAmount must be a positive number");

    const provider = providerName
      ? await prisma.provider.findFirst({
          where: { tenantId, name: { equals: providerName, mode: "insensitive" } },
          select: { id: true, name: true, contractStatus: true },
        })
      : null;
    if (providerName && !provider) rowErrors.push(`Provider ${providerName} not found`);
    if (provider && !ProvidersService.isOperational(provider.contractStatus)) {
      rowErrors.push(`Provider contract is ${provider.contractStatus}`);
    }
    const memberExists = memberNumber
      ? (await prisma.member.count({ where: { tenantId, memberNumber } })) > 0
      : false;
    if (memberNumber && !memberExists) rowErrors.push(`Member ${memberNumber} not found`);

    if (rowErrors.length > 0 || !provider || !serviceDate) {
      conservation.skippedTotal += rowBilled;
      errors.push({ row: rowNumber, memberNumber, providerName, invoiceNumber, errors: rowErrors });
      continue;
    }

    if (preview) {
      results.push({ row: rowNumber, outcome: "VALID", claimNumber: null, receiptId: null, memberNumber, providerName: provider.name, billedAmount: rowBilled });
      continue;
    }

    const lineDescription = cptCode ? `CPT ${cptCode}` : diagnosisCode ? `Diagnosis ${diagnosisCode}` : "Imported service line";
    const submission = {
      schemaVersion: "1" as const,
      // §8.5: durable per-row key — same file re-uploaded ⇒ replay, zero new claims.
      idempotencyKey: `csv:${fileSha.slice(0, 16)}:0:${rowNumber}:${provider.id}`,
      ...(invoiceNumber ? { invoiceNumber } : {}),
      member: { memberNumber },
      provider: { providerId: provider.id },
      encounter: { serviceType: "OUTPATIENT" as const, benefitCategory: "OUTPATIENT" as const, serviceFrom: serviceDate },
      diagnoses: diagnosisCode ? [{ code: diagnosisCode, isPrimary: true }] : [],
      lines: [
        {
          serviceCategory: "OTHER" as const,
          ...(cptCode ? { cptCode } : {}),
          ...(diagnosisCode ? { icdCode: diagnosisCode } : {}),
          description: lineDescription,
          quantity: 1,
          unitCost: rowBilled,
          billedAmount: rowBilled,
        },
      ],
      origin: { batchId: fileSha.slice(0, 16), rowNumber },
    };

    try {
      const result = await ClaimIntakeService.submit(
        { kind: "csvOperator", tenantId, userId: session.user.id },
        submission,
      );
      const outcome: RowResult["outcome"] = result.outcome === "ACCEPTED" ? "IMPORTED" : result.outcome === "REPLAYED" ? "REPLAYED" : "LINKED";
      if (outcome === "IMPORTED") {
        conservation.importedTotal += rowBilled;
        acceptedCount += 1;
      } else if (outcome === "REPLAYED") conservation.replayedTotal += rowBilled;
      else conservation.linkedTotal += rowBilled;
      results.push({ row: rowNumber, outcome, claimNumber: result.claimNumber, receiptId: result.receiptId, memberNumber, providerName: provider.name, billedAmount: rowBilled });
    } catch (err) {
      const e = IntakeError.from(err);
      conservation.skippedTotal += rowBilled;
      errors.push({
        row: rowNumber,
        memberNumber,
        providerName,
        invoiceNumber,
        errors: [e.issues?.length ? e.issues.map((i) => i.message).join("; ") : e.message],
      });
    }
  }

  // D9: accelerate processing of freshly accepted rows in-request (bounded);
  // the durable runs + recovery sweep remain the authoritative backstop.
  if (!preview && acceptedCount > 0) {
    try {
      const [{ registerClaimAutopilotProcessor }, { runClaimAutopilotRecoveryJob }] = await Promise.all([
        import("@/server/services/claim-autopilot/processor"),
        import("@/server/jobs/claim-autopilot.job"),
      ]);
      registerClaimAutopilotProcessor();
      await runClaimAutopilotRecoveryJob({ batchSize: Math.min(acceptedCount, 25) });
    } catch {
      /* best-effort — the sweep will process the remainder */
    }
  }

  if (wantJson) {
    return NextResponse.json({ preview, results, errors, conservation });
  }
  return new Response(renderSummary(preview, results, errors, conservation), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
