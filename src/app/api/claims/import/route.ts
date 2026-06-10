import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { claimAdjudicationService } from "@/server/services/claim-adjudication.service";
import { ClaimLineCategory } from "@prisma/client";

const MAX_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".xlsx", ".xls"];
const CLINICAL_ROLES = ["SUPER_ADMIN", "CLAIMS_OFFICER", "MEDICAL_OFFICER"];

type ImportError = {
  row: number;
  memberNumber?: string;
  providerName?: string;
  invoiceNumber?: string;
  errors: string[];
};

type ImportedClaim = {
  row: number;
  claimNumber: string;
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

function parseServiceDate(value: unknown) {
  if (value instanceof Date) return value;
  const raw = cellText(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function renderSummary(imported: ImportedClaim[], errors: ImportError[]) {
  const importedRows = imported.map((item) => `
    <tr>
      <td>${item.row}</td>
      <td><a href="/claims?search=${encodeURIComponent(item.claimNumber)}">${escapeHtml(item.claimNumber)}</a></td>
      <td>${escapeHtml(item.memberNumber)}</td>
      <td>${escapeHtml(item.providerName)}</td>
      <td class="num">${item.billedAmount.toLocaleString("en-KE")}</td>
    </tr>
  `).join("");

  const errorRows = errors.map((item) => `
    <tr>
      <td>${item.row}</td>
      <td>${escapeHtml(item.memberNumber)}</td>
      <td>${escapeHtml(item.providerName)}</td>
      <td>${escapeHtml(item.invoiceNumber)}</td>
      <td>${escapeHtml(item.errors.join("; "))}</td>
    </tr>
  `).join("");

  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Bulk Claims Import</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 32px; color: #212529; background: #f8f9fa; }
          main { max-width: 1100px; margin: 0 auto; background: #fff; border: 1px solid #eee; border-radius: 8px; padding: 24px; }
          h1 { margin: 0 0 8px; color: #292A83; }
          .summary { display: flex; gap: 16px; margin: 20px 0; }
          .pill { border: 1px solid #eee; border-radius: 8px; padding: 12px 16px; min-width: 160px; }
          .count { font-size: 28px; font-weight: 700; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px; }
          th, td { border-bottom: 1px solid #eee; text-align: left; padding: 10px; vertical-align: top; }
          th { background: #e6e7e8; color: #6c757d; font-size: 12px; text-transform: uppercase; }
          .num { text-align: right; font-variant-numeric: tabular-nums; }
          a { color: #292A83; font-weight: 700; text-decoration: none; }
          .actions { margin-top: 24px; display: flex; gap: 12px; }
          .button { display: inline-block; border-radius: 999px; padding: 10px 16px; background: #292A83; color: #fff; }
          .secondary { background: #fff; color: #292A83; border: 1px solid #292A83; }
        </style>
      </head>
      <body>
        <main>
          <h1>Bulk Claims Import Complete</h1>
          <p>Valid rows were imported as received batch claims. Rows with errors were skipped.</p>
          <div class="summary">
            <div class="pill"><div class="count">${imported.length}</div><div>Imported</div></div>
            <div class="pill"><div class="count">${errors.length}</div><div>Skipped</div></div>
          </div>
          <h2>Imported Claims</h2>
          <table>
            <thead><tr><th>Row</th><th>Claim</th><th>Member</th><th>Provider</th><th class="num">Billed KES</th></tr></thead>
            <tbody>${importedRows || '<tr><td colspan="5">No claims imported.</td></tr>'}</tbody>
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

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as never);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return new Response(renderSummary([], [{ row: 0, errors: ["Workbook has no worksheets"] }]), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const imported: ImportedClaim[] = [];
  const errors: ImportError[] = [];
  const tenantId = session.user.tenantId;

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
      continue;
    }

    const rowErrors: string[] = [];
    if (!memberNumber) rowErrors.push("MemberNumber is required");
    if (!providerName) rowErrors.push("ProviderName is required");
    if (!serviceDate) rowErrors.push("DateOfService must be a valid date");
    if (!Number.isFinite(billedAmount) || billedAmount <= 0) rowErrors.push("BilledAmount must be a positive number");

    const member = memberNumber
      ? await prisma.member.findFirst({
          where: { tenantId, memberNumber },
          select: { id: true, memberNumber: true, status: true, group: { select: { status: true } } },
        })
      : null;
    if (memberNumber && !member) rowErrors.push(`Member ${memberNumber} not found`);

    const provider = providerName
      ? await prisma.provider.findFirst({
          where: { tenantId, name: { equals: providerName, mode: "insensitive" } },
          select: { id: true, name: true, contractStatus: true },
        })
      : null;
    if (providerName && !provider) rowErrors.push(`Provider ${providerName} not found`);
    if (provider && ["EXPIRED", "SUSPENDED"].includes(provider.contractStatus)) {
      rowErrors.push(`Provider contract is ${provider.contractStatus}`);
    }

    const blockedStatuses = ["SUSPENDED", "LAPSED", "TERMINATED"];
    if (member && blockedStatuses.includes(member.status)) rowErrors.push(`Member status is ${member.status}`);
    if (member?.group && blockedStatuses.includes(member.group.status)) rowErrors.push(`Group status is ${member.group.status}`);

    if (member && provider && serviceDate) {
      const gate = await claimAdjudicationService.runHardGateValidation(tenantId, {
        providerId: provider.id,
        memberId: member.id,
        dateOfService: serviceDate,
        benefitCategory: "OUTPATIENT",
        invoiceNumber: invoiceNumber || undefined,
      });
      if (!gate.passed) rowErrors.push(...gate.errors);
    }

    if (rowErrors.length > 0 || !member || !provider || !serviceDate) {
      errors.push({ row: rowNumber, memberNumber, providerName, invoiceNumber, errors: rowErrors });
      continue;
    }

    try {
      const count = await prisma.claim.count({ where: { tenantId } });
      const claimNumber = `CLM-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;
      const lineDescription = cptCode ? `CPT ${cptCode}` : diagnosisCode ? `Diagnosis ${diagnosisCode}` : "Imported service line";

      const claim = await prisma.claim.create({
        data: {
          tenantId,
          claimNumber,
          invoiceNumber: invoiceNumber || null,
          memberId: member.id,
          providerId: provider.id,
          source: "BATCH",
          serviceType: "OUTPATIENT",
          dateOfService: serviceDate,
          diagnoses: diagnosisCode
            ? [{ icdCode: diagnosisCode, description: diagnosisCode, isPrimary: true }]
            : [],
          procedures: cptCode
            ? [{ cptCode, description: lineDescription, quantity: 1, unitCost: billedAmount, totalCost: billedAmount }]
            : [],
          billedAmount,
          benefitCategory: "OUTPATIENT",
          status: "RECEIVED",
          claimLines: {
            create: {
              lineNumber: 1,
              description: lineDescription,
              icdCode: diagnosisCode || null,
              cptCode: cptCode || null,
              quantity: 1,
              unitCost: billedAmount,
              billedAmount,
              approvedAmount: 0,
              serviceCategory: ClaimLineCategory.OTHER,
            },
          },
          adjudicationLogs: {
            create: {
              userId: session.user.id,
              action: "RECEIVED",
              toStatus: "RECEIVED",
              notes: `Imported from ${file.name} row ${rowNumber}.`,
            },
          },
        },
        select: { id: true, claimNumber: true },
      });

      await claimAdjudicationService.computeContractedRateVariance(claim.id, tenantId);
      imported.push({ row: rowNumber, claimNumber: claim.claimNumber, memberNumber, providerName: provider.name, billedAmount });
    } catch (error) {
      errors.push({
        row: rowNumber,
        memberNumber,
        providerName,
        invoiceNumber,
        errors: [error instanceof Error ? error.message : "Import failed"],
      });
    }
  }

  return new Response(renderSummary(imported, errors), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
