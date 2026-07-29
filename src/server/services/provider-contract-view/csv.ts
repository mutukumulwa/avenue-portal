import { createHash } from "crypto";
import { csvCell } from "@/server/services/provider-remittance/csv";
import type { ContractHeaderView, TariffView } from "./projection";

/**
 * PNOS F7.3 — provider contract rate-schedule CSV serializer (pure).
 *
 * Serialises the SAME provider-safe read model (ProviderContractViewService
 * getRates → TariffView) that the page renders — no separate query or field set,
 * so the export can never carry a field the page hides (F7.1 allow-list). It
 * reuses the F6.5 `csvCell` OWASP formula-injection guard + RFC-4180 quoting, a
 * UTF-8 BOM (Excel), a STABLE versioned column dictionary, and a sha256 checksum
 * of the exact bytes. A watermark preamble names the recipient provider so a
 * leaked file is traceable; it carries NO wall-clock (the checksum stays
 * deterministic — the export instant lives in the audit + HTTP header instead).
 */

export const CONTRACT_RATES_CSV_VERSION = "1.0";

/** Stable column dictionary (order is part of the contract; append only, never reorder). */
export const CONTRACT_RATES_CSV_COLUMNS = [
  "Service", "CPT", "Provider Code", "Coding System", "Rate", "Currency", "Rate Type", "Tariff Type",
  "Discount %", "Markup %", "Max Payable", "Min Payable", "Unit", "Max Qty/Visit", "Qty Limit",
  "Frequency Limit", "Frequency Period", "Gender", "Age Min", "Age Max", "Requires PA", "Requires Referral",
  "External Rebate", "Rate Under Confirmation", "Effective From", "Effective To",
] as const;

function isoDate(d: Date | string | null): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}

export interface ContractRatesCsvEvidence {
  version: string;
  rowCount: number; // one per effective rate line
  contractNumber: string;
  checksum: string; // sha256 of the delivered bytes (with BOM)
}

export function buildContractRatesCsv(input: {
  header: ContractHeaderView;
  providerName: string;
  rates: TariffView[];
}): { csv: string; evidence: ContractRatesCsvEvidence } {
  const { header, providerName, rates } = input;
  const line = (cells: (string | number | null)[]) => cells.map(csvCell).join(",");

  const rows: string[] = [];
  // Watermark + metadata preamble (not part of the column table; no timestamp → deterministic checksum).
  rows.push(line([`Contract rate schedule v${CONTRACT_RATES_CSV_VERSION} — CONFIDENTIAL: provided to ${providerName}; do not redistribute`]));
  rows.push(line(["Contract", header.contractNumber, header.title, "Status", header.effectiveLabel, "Currency", header.currency]));
  rows.push("");
  rows.push(line([...CONTRACT_RATES_CSV_COLUMNS]));

  let rowCount = 0;
  for (const r of rates) {
    rowCount += 1;
    rows.push(
      line([
        r.service, r.cptCode ?? "", r.providerCode ?? "", r.codingSystem ?? "",
        // A missing rate is shown as an explicit label, never a blank that reads as free.
        r.rateUnderConfirmation ? "under confirmation" : (r.rate ?? ""), r.currency, r.rateType, r.tariffType,
        r.discountPct ?? "", r.markupPct ?? "", r.maxPayable ?? "", r.minPayable ?? "", r.unit,
        r.maxQuantityPerVisit ?? "", r.quantityLimit ?? "", r.frequencyLimit ?? "", r.frequencyPeriod ?? "",
        r.genderRestriction ?? "", r.ageMin ?? "", r.ageMax ?? "",
        r.requiresPreauth ? "Yes" : "No", r.requiresReferral ? "Yes" : "No",
        r.externalRebate ?? "", r.rateUnderConfirmation ? "Yes" : "No",
        isoDate(r.effectiveFrom), isoDate(r.effectiveTo),
      ]),
    );
  }

  const BOM = "﻿"; // UTF-8 BOM so Excel reads Unicode correctly
  const csv = `${BOM}${rows.join("\r\n")}\r\n`;
  const checksum = createHash("sha256").update(csv, "utf8").digest("hex");
  return { csv, evidence: { version: CONTRACT_RATES_CSV_VERSION, rowCount, contractNumber: header.contractNumber, checksum } };
}
