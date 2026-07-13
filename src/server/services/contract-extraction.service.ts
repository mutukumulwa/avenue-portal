import { prisma } from "@/lib/prisma";
import { ProviderContractsService } from "./provider-contracts.service";
import { ServiceCategoryService } from "./service-category.service";

// ─── CONTRACT MARKDOWN EXTRACTION (spec §12, Phase 4) ────────────────────────
// A deterministic, rule-based extractor over the OCR→markdown corpus. It is
// assistive only and NEVER activates anything. The non-negotiable rule (§12/§20):
// zero-hallucination — no amount enters a field without a source-cell provenance
// record. Rows with detected structure but unreadable amounts become
// `rateMissing` candidates (O2), never guessed values.

export interface TariffCandidate {
  description: string;
  rawCategory: string | null;
  canonicalCategory: string | null;
  amount: number | null;
  rateMissing: boolean;
  sourceRef: { page: number; rawText: string };
  confidence: number;
}

export interface Ambiguity {
  type: string; // AMBIGUOUS_EFFECTIVE_DATE | VALIDITY_REVIEW_BASED | CURRENCY_UNSTATED | TAX_UNSTATED | RATE_MISSING_ROWS
  message: string;
  candidates?: string[];
  blocking: boolean; // must be resolved before activation (§13)
}

export interface ExtractionEntities {
  effectiveDateCandidates: string[]; // ISO yyyy-mm-dd (or yyyy-mm for month-only)
  reviewBased: boolean;
  externalRefs: string[];
  providerNames: string[];
  currencyStated: string | null;
  taxStated: boolean;
}

export interface ExtractionResult {
  entities: ExtractionEntities;
  tariffCandidates: TariffCandidate[];
  ambiguities: Ambiguity[];
  stats: { rowsDetected: number; rowsWithRate: number; rowsMissingRate: number };
}

const CATEGORY_KEYWORDS: Array<[RegExp, string]> = [
  [/consultation/i, "CONSULTATION"],
  [/laborator|\blab\b|haematolog|biochem/i, "LABORATORY"],
  [/pharmac|drug/i, "PHARMACY"],
  [/radiolog|x-?ray|\bct\b|\bmri\b|ultrasound|imaging|scan/i, "RADIOLOGY"],
  [/dialysis/i, "DIALYSIS"],
  [/ambulance/i, "AMBULANCE"],
  [/physio/i, "PHYSIOTHERAPY"],
  [/dental/i, "DENTAL"],
  [/matern|delivery|caesar|obstetr/i, "MATERNITY"],
  [/theatre|surg/i, "SURGERY"],
  [/\bicu\b|\bhdu\b|\bnicu\b|ward|bed|admission|nursing|nutrition/i, "IP_SERVICES"],
  [/procedure/i, "PROCEDURE"],
];

// Trailing amount on a rate row: thousands-separated (1,000 / 10,000.00), a
// decimal with 2dp (650.00), OR a bare 3–6 digit integer (880, 4800) — but only
// when it sits at the END of the row (before trailing OCR junk). Anchoring to
// the line end avoids grabbing embedded numbers like the "50" in "50KM".
const TRAILING_AMOUNT_RE = /(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{2}|\d{3,6})(?=[\s|_:.\])]*$)/;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function canonicalCategory(text: string): string | null {
  for (const [re, cat] of CATEGORY_KEYWORDS) if (re.test(text)) return cat;
  return null;
}

function parseAmount(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

/** Clean OCR row noise: strip table pipes/brackets and trailing junk chars. */
function cleanRow(line: string): string {
  return line
    .replace(/^[\s|[\]_:.+=]+/, "")
    .replace(/[\s|[\]_:.+=]+$/, "")
    .replace(/\s{2,}/g, "  ")
    .trim();
}

/** Extract full dates ("01st February 2025", "04: February 2025", "24 Oct 2024"). */
function extractDates(text: string): Array<{ iso: string; index: number; raw: string }> {
  const out: Array<{ iso: string; index: number; raw: string }> = [];
  const re = /(\d{1,2})(?:st|nd|rd|th)?[\s:]+([A-Za-z]{3,9})\.?\s+(\d{4})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const day = Number(m[1]);
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    const year = Number(m[3]);
    if (!mon || day < 1 || day > 31) continue;
    out.push({ iso: `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`, index: m.index, raw: m[0] });
  }
  return out;
}

export class ContractExtractionService {
  /**
   * Pure, deterministic parse of a markdown source into structured candidates,
   * detected entities, and mandatory review questions. No DB access.
   */
  static parse(markdown: string): ExtractionResult {
    // Split into pages by "## Page N" markers (fallback: whole doc = page 1).
    const pageSplits = markdown.split(/^##\s*Page\s+(\d+)\s*$/im);
    const pages: Array<{ number: number; text: string }> = [];
    if (pageSplits.length <= 1) {
      pages.push({ number: 1, text: markdown });
    } else {
      // pageSplits = [pre, "1", body1, "2", body2, ...]
      for (let i = 1; i < pageSplits.length; i += 2) {
        pages.push({ number: Number(pageSplits[i]), text: pageSplits[i + 1] ?? "" });
      }
    }

    // ── Rate rows ──
    const candidates: TariffCandidate[] = [];
    const seen = new Set<string>(); // de-dup by content hash (O7)
    for (const page of pages) {
      for (const rawLine of page.text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;
        const isTableRow = /^[|[]/.test(line);
        const cat = canonicalCategory(line);
        // Only treat as a rate row if it is a table row OR clearly starts with a
        // category — never generic prose.
        if (!isTableRow && !cat) continue;

        const cleaned = cleanRow(line);
        if (cleaned.length < 3) continue;

        const trail = cleaned.match(TRAILING_AMOUNT_RE);
        if (trail && trail.index !== undefined) {
          const amount = parseAmount(trail[0]);
          const desc = cleaned.slice(0, trail.index).replace(/[\s|:_.+=-]+$/, "").trim();
          if (desc.length < 2) continue; // no describable service → skip
          const key = `${desc.toLowerCase()}|${amount}`;
          if (seen.has(key)) continue;
          seen.add(key);
          candidates.push({
            description: desc,
            rawCategory: cat,
            canonicalCategory: cat,
            amount,
            rateMissing: false,
            sourceRef: { page: page.number, rawText: line },
            confidence: cat ? 0.9 : 0.75,
          });
        } else {
          // Structured row, no readable amount → rateMissing (never guess).
          const desc = cleaned;
          const key = `missing|${desc.toLowerCase()}`;
          if (seen.has(key)) continue;
          seen.add(key);
          candidates.push({
            description: desc,
            rawCategory: cat,
            canonicalCategory: cat,
            amount: null,
            rateMissing: true,
            sourceRef: { page: page.number, rawText: line },
            confidence: 0.4,
          });
        }
      }
    }

    // ── Entities ──
    const flat = markdown.replace(/\r?\n/g, " ");
    const allDates = extractDates(flat);
    const effectiveCandidates = new Set<string>();
    for (const d of allDates) {
      const ctx = flat.slice(Math.max(0, d.index - 28), d.index).toLowerCase();
      if (/effective|starting from|with effect|commenc|start date/.test(ctx)) effectiveCandidates.add(d.iso);
    }
    const reviewBased = /subject to review|will be subject to review|valid for (?:a period of )?(?:one|two|1|2)\s+year/i.test(flat);
    const externalRefs = [...new Set((flat.match(/\bCN[-\s]?\d{4,}\b/gi) ?? []).map(s => s.replace(/\s/g, "").toUpperCase()))];
    const providerNames = [...new Set((flat.match(/(?:AFRIHOSPITAL[^.]{0,40}|LIFE\s?CARE[^.,\n]{0,30})/gi) ?? []).map(s => s.trim()))].slice(0, 5);
    const currencyMatch = flat.match(/\b(KES|KSHS?|UGX|USD)\b/i);
    const currencyStated = currencyMatch ? currencyMatch[1].toUpperCase().replace("KSHS", "KES").replace("KSH", "KES") : null;
    const taxStated = /inclusive of tax|exclusive of tax|\bVAT\b|inclusive of taxes/i.test(flat);

    const entities: ExtractionEntities = {
      effectiveDateCandidates: [...effectiveCandidates].sort(),
      reviewBased,
      externalRefs,
      providerNames,
      currencyStated,
      taxStated,
    };

    // ── Ambiguities (mandatory review questions, §12.7) ──
    const ambiguities: Ambiguity[] = [];
    if (entities.effectiveDateCandidates.length > 1) {
      ambiguities.push({ type: "AMBIGUOUS_EFFECTIVE_DATE", message: "Multiple conflicting effective dates found — confirm one before activation.", candidates: entities.effectiveDateCandidates, blocking: true });
    }
    if (entities.effectiveDateCandidates.length === 0) {
      ambiguities.push({ type: "EFFECTIVE_DATE_UNSTATED", message: "No effective date detected — enter one.", blocking: true });
    }
    if (reviewBased) {
      ambiguities.push({ type: "VALIDITY_REVIEW_BASED", message: "Validity is review-based ('subject to review') — set a reviewDueDate distinct from the end date (O4).", blocking: false });
    }
    if (!currencyStated) {
      ambiguities.push({ type: "CURRENCY_UNSTATED", message: "Currency not stated — confirm (corpus is implied KES).", blocking: false });
    }
    if (!taxStated) {
      ambiguities.push({ type: "TAX_UNSTATED", message: "Tax inclusivity not stated — answer INCLUSIVE/EXCLUSIVE/UNKNOWN.", blocking: false });
    }
    const rowsMissingRate = candidates.filter(c => c.rateMissing).length;
    if (rowsMissingRate > 0) {
      ambiguities.push({ type: "RATE_MISSING_ROWS", message: `${rowsMissingRate} row(s) detected with unreadable rates — transcribe from the source before activation.`, blocking: true });
    }

    return {
      entities,
      tariffCandidates: candidates,
      ambiguities,
      stats: { rowsDetected: candidates.length, rowsWithRate: candidates.length - rowsMissingRate, rowsMissingRate },
    };
  }

  /** Run the extractor and persist a ContractExtraction row (status PARSED). */
  static async createExtraction(tenantId: string, input: { markdown: string; fileName?: string; sourceDocumentId?: string; createdById?: string }) {
    const result = this.parse(input.markdown);
    return prisma.contractExtraction.create({
      data: {
        tenantId,
        fileName: input.fileName,
        sourceDocumentId: input.sourceDocumentId,
        status: "PARSED",
        entities: result.entities as never,
        tariffCandidates: result.tariffCandidates as never,
        ambiguities: result.ambiguities as never,
        stats: result.stats as never,
        createdById: input.createdById,
      },
    });
  }

  /**
   * Commit reviewed candidates into a new DRAFT contract (spec §12.11). Only
   * candidates the reviewer kept are written; rateMissing candidates import as
   * rate-missing tariff lines (they block activation until priced, §13-V6).
   * NEVER activates — the contract lands in DRAFT for the normal approval path.
   */
  static async commit(
    tenantId: string,
    extractionId: string,
    input: {
      providerId: string;
      title: string;
      startDate: Date;
      endDate: Date;
      currency: string;
      keepCandidateIndexes?: number[]; // subset to import; default all
      createdById?: string;
    },
  ) {
    const extraction = await prisma.contractExtraction.findUnique({ where: { id: extractionId, tenantId } });
    if (!extraction) throw new Error("Extraction not found");
    const candidates = (extraction.tariffCandidates as unknown as TariffCandidate[]) ?? [];
    const keep = input.keepCandidateIndexes ? new Set(input.keepCandidateIndexes) : null;
    const selected = candidates.filter((_, i) => (keep ? keep.has(i) : true));

    const contractNumber = await ProviderContractsService.nextContractNumber(tenantId);
    // Canonical-category assignment (WP-E2): resolve each kept candidate to a
    // seeded category so the fee schedule tiers it instead of dumping in Other.
    const categoryIdByCode = await ServiceCategoryService.tenantCategoryIdByCode(tenantId);
    const contract = await prisma.$transaction(async tx => {
      const c = await tx.providerContract.create({
        data: {
          tenantId,
          providerId: input.providerId,
          contractNumber,
          title: input.title,
          contractType: "RATE_SCHEDULE",
          status: "DRAFT",
          startDate: input.startDate,
          endDate: input.endDate,
          currency: input.currency,
          executionStatus: "UNSIGNED",
          createdById: input.createdById,
          contractOwnerId: input.createdById,
        },
      });
      if (selected.length > 0) {
        await tx.providerTariff.createMany({
          data: selected.map(cand => {
            const catCode = ServiceCategoryService.categoryCodeForTariff({ serviceName: cand.description });
            return {
              providerId: input.providerId,
              contractId: c.id,
              serviceName: cand.description,
              standardDescription: cand.description,
              providerDescription: cand.sourceRef.rawText,
              agreedRate: cand.amount ?? 0, // rateMissing rows carry 0 + rateMissing flag
              currency: input.currency,
              rateMissing: cand.rateMissing,
              serviceCategoryId: catCode ? categoryIdByCode.get(catCode) ?? null : null,
              sourceRef: cand.sourceRef as never,
              effectiveFrom: input.startDate,
            };
          }),
        });
      }
      await tx.contractExtraction.update({ where: { id: extractionId }, data: { status: "COMMITTED", contractId: c.id } });
      return c;
    });
    return { contractId: contract.id, imported: selected.length };
  }
}
