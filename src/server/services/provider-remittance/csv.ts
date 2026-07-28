import { createHash } from "crypto";
import Decimal from "decimal.js";
import type { RemittanceBatchHeader, RemittanceClaim, ConservationResult } from "./projection";

/**
 * PNOS F6.5 — remittance CSV serializer (pure).
 *
 * Derives a line-grain CSV from the SAME provider-safe read model
 * (getBatchRemittance) — no separate query or arithmetic (D15). Properties:
 *  - a STABLE, versioned column dictionary (REMITTANCE_CSV_VERSION);
 *  - spreadsheet formula-injection protection (OWASP: neutralize a leading
 *    = + - @ TAB CR by prefixing a single quote) — the existing app CSV exports
 *    lack this; F6.5 adds it;
 *  - UTF-8 with a BOM so Excel reads Unicode correctly;
 *  - evidence: row count, decimal totals, and a sha256 checksum of the exact
 *    delivered bytes (deterministic — no wall-clock in the body).
 */

export const REMITTANCE_CSV_VERSION = "1.0";

/** Stable column dictionary (order is part of the contract; append only, never reorder). */
export const REMITTANCE_CSV_COLUMNS = [
  "Cycle", "Currency", "Claim No", "Member No", "Member Name", "Service Date", "Submission Type",
  "Line", "Description", "CPT", "Billed", "Contracted Allowed", "Disallowed", "Member Share",
  "Provider Write-off", "Approved", "Paid", "Reason Code", "Reason",
] as const;

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DANGEROUS_LEAD = /^[=+\-@\t\r]/;

/** CSV-escape a single cell, neutralizing spreadsheet-formula injection first. */
export function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  // OWASP CSV-injection: a cell a spreadsheet would evaluate as a formula is
  // rendered inert by a leading apostrophe (Excel/Sheets treat it as text).
  if (DANGEROUS_LEAD.test(s)) s = `'${s}`;
  // RFC-4180 quoting for delimiter / quote / newline.
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function cycleLabel(b: RemittanceBatchHeader): string {
  return `${MONTHS[b.cycleMonth] ?? b.cycleMonth} ${b.cycleYear}${b.sequence > 1 ? ` R${b.sequence}` : ""}`;
}
function isoDate(d: Date | string | null): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}

export interface RemittanceCsvEvidence {
  version: string;
  rowCount: number; // data rows (one per claim line)
  totals: { billed: string; approved: string; paid: string };
  checksum: string; // sha256 of the delivered bytes (with BOM)
}

export function buildRemittanceCsv(input: {
  batch: RemittanceBatchHeader;
  claims: RemittanceClaim[];
  conservation: ConservationResult;
}): { csv: string; evidence: RemittanceCsvEvidence } {
  const { batch, claims } = input;
  const cyc = cycleLabel(batch);
  const line = (cells: (string | number | null)[]) => cells.map(csvCell).join(",");

  const rows: string[] = [];
  // Metadata preamble (not part of the column table; no timestamp → deterministic checksum).
  rows.push(line([`Remittance export v${REMITTANCE_CSV_VERSION}`]));
  rows.push(line(["Cycle", cyc, "Currency", batch.currency, "Status", batch.status]));
  rows.push("");
  rows.push(line([...REMITTANCE_CSV_COLUMNS]));

  let billed = new Decimal(0);
  let approved = new Decimal(0);
  let paid = new Decimal(0);
  let rowCount = 0;

  for (const c of claims) {
    for (const l of c.lines) {
      rowCount += 1;
      billed = billed.plus(l.billed);
      approved = approved.plus(l.approvedPayable);
      paid = paid.plus(l.paid);
      rows.push(
        line([
          cyc, batch.currency, c.claimNumber, c.member?.memberNumber ?? "", c.member?.name ?? "",
          isoDate(c.dateOfService), c.lineage.submissionType,
          l.lineNumber, l.description, l.cptCode ?? "",
          l.billed, l.contractedAllowed ?? "", l.disallowed, l.memberShare, l.providerWriteoff,
          l.approvedPayable, l.paid,
          l.reason?.code ?? "", l.reason?.text ?? c.declineReason?.text ?? "",
        ]),
      );
    }
  }

  const totals = { billed: billed.toFixed(2), approved: approved.toFixed(2), paid: paid.toFixed(2) };
  // Totals row aligned to the column dictionary (Billed=10, Approved=15, Paid=16).
  const totalCells: (string | number | null)[] = new Array(REMITTANCE_CSV_COLUMNS.length).fill("");
  totalCells[0] = "TOTAL";
  totalCells[10] = totals.billed;
  totalCells[15] = totals.approved;
  totalCells[16] = totals.paid;
  rows.push(line(totalCells));

  const BOM = "﻿"; // UTF-8 BOM so Excel reads Unicode correctly
  const csv = `${BOM}${rows.join("\r\n")}\r\n`;
  const checksum = createHash("sha256").update(csv, "utf8").digest("hex");
  return { csv, evidence: { version: REMITTANCE_CSV_VERSION, rowCount, totals, checksum } };
}
