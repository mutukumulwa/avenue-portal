import "server-only";

/**
 * Family Hospital UAT plan P04.02 — seed a correction or resubmission form
 * from the earlier claim's IMMUTABLE stored data.
 *
 * Step 2 of P04.02: "Seed existing lines by immutable stored provenance. If a
 * historical line has no current tariff ID, label it 'historical/unlisted' and
 * require explicit reselection only when the user changes it."
 *
 *   - A line captured from the price list (it carries `selectedProviderTariffId`
 *     and the captured contracted rate) is seeded as that selection, shown with
 *     its STORED name and rate. On submit the server re-reads the row by id for
 *     the (possibly changed) service date; if it no longer applies, the user is
 *     asked to select the service again.
 *   - Any other line (every claim filed before this change) is seeded as
 *     historical: description, category, quantity and billed price exactly as
 *     stored. Unchanged, it is carried as it was — the server checks that
 *     against the stored line (`CarriedLine`). Changed, it is judged afresh.
 *
 * Nothing is re-priced here and no global price is read. The diagnosis is the
 * stored primary code, shown with the catalogue's description.
 */
import type { BenefitCategory, ClaimLineCategory, Prisma, ServiceType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatGroupedAmount } from "@/lib/money";
import { operatingTodayISO } from "@/lib/service-date";
import type { DiagnosisOption } from "@/lib/provider-capture-contract";
import type { CaptureLineState } from "@/components/provider/ServiceLineEditor";

export interface ReplacementSeedSource {
  memberId: string;
  member: { firstName: string; lastName: string };
  providerBranchId: string | null;
  providerBranch: { name: string } | null;
  serviceType: ServiceType;
  benefitCategory: BenefitCategory;
  dateOfService: Date;
  attendingDoctor: string | null;
  billedAmount: Prisma.Decimal;
  currency: string;
  diagnoses: Prisma.JsonValue;
  claimLines: Array<{
    lineNumber: number;
    serviceCategory: ClaimLineCategory;
    description: string;
    cptCode: string | null;
    quantity: number;
    unitCost: Prisma.Decimal;
    selectedProviderTariffId: string | null;
    tariffRate: Prisma.Decimal | null;
  }>;
}

export interface ReplacementSeed {
  member: { memberRef: string; branchId: string | null; displayName: string };
  branchName: string | null;
  serviceType: ServiceType;
  benefitCategory: BenefitCategory;
  serviceDate: string;
  attendingDoctor: string;
  diagnosis: DiagnosisOption | null;
  lines: CaptureLineState[];
  /** Canonical decimal text. */
  originalBilled: string;
  currency: string;
}

/** The Prisma `select` a page needs to build a seed. */
export const REPLACEMENT_SEED_SELECT = {
  memberId: true,
  member: { select: { firstName: true, lastName: true } },
  providerBranchId: true,
  providerBranch: { select: { name: true } },
  serviceType: true,
  benefitCategory: true,
  dateOfService: true,
  attendingDoctor: true,
  billedAmount: true,
  currency: true,
  diagnoses: true,
  claimLines: {
    select: { lineNumber: true, serviceCategory: true, description: true, cptCode: true, quantity: true, unitCost: true, selectedProviderTariffId: true, tariffRate: true },
    orderBy: { lineNumber: "asc" as const },
  },
} satisfies Prisma.ClaimSelect;

/** Claim.diagnoses carries two shapes ({code} and {icdCode}); the primary, or the first. */
function primaryCode(diagnoses: Prisma.JsonValue): string | null {
  const list = Array.isArray(diagnoses) ? (diagnoses as Array<{ code?: unknown; icdCode?: unknown; isPrimary?: unknown }>) : [];
  const pick = list.find((d) => d && d.isPrimary === true) ?? list[0];
  const code = pick ? (typeof pick.icdCode === "string" ? pick.icdCode : typeof pick.code === "string" ? pick.code : "") : "";
  return code.trim() ? code.trim().toUpperCase() : null;
}

export async function replacementSeed(claim: ReplacementSeedSource): Promise<ReplacementSeed> {
  const code = primaryCode(claim.diagnoses);
  const dx = code ? await prisma.iCD10Code.findUnique({ where: { code }, select: { code: true, description: true, category: true } }) : null;

  const lines: CaptureLineState[] = claim.claimLines.map((l) => {
    const key = `seed-${l.lineNumber}`;
    const billedUnitPrice = formatGroupedAmount(l.unitCost.toString());
    if (l.selectedProviderTariffId && l.tariffRate !== null) {
      return {
        key,
        serviceCategory: l.serviceCategory,
        selected: {
          tariffId: l.selectedProviderTariffId,
          serviceName: l.description,
          providerServiceCode: null,
          cptCode: l.cptCode,
          category: l.serviceCategory,
          taxonomyName: null,
          unitRate: l.tariffRate.toString(),
          currency: claim.currency,
          unitLabel: null,
          requiresPreauth: false,
          effectiveFrom: "",
          selectable: true,
          unavailableReason: null,
        },
        unlisted: false,
        description: "",
        quantity: String(l.quantity),
        billedUnitPrice,
      };
    }
    return {
      key,
      serviceCategory: l.serviceCategory,
      selected: null,
      unlisted: false,
      historical: true,
      historicalLineNumber: l.lineNumber,
      description: l.description,
      quantity: String(l.quantity),
      billedUnitPrice,
    };
  });

  return {
    member: { memberRef: claim.memberId, branchId: claim.providerBranchId, displayName: `${claim.member.firstName} ${claim.member.lastName}`.trim() },
    branchName: claim.providerBranch?.name ?? null,
    serviceType: claim.serviceType,
    benefitCategory: claim.benefitCategory,
    // The Kampala calendar day of the stored instant (claims store UTC midnight).
    serviceDate: operatingTodayISO(claim.dateOfService),
    attendingDoctor: claim.attendingDoctor ?? "",
    diagnosis: dx ? { code: dx.code, description: dx.description, category: dx.category } : null,
    lines,
    originalBilled: claim.billedAmount.toString(),
    currency: claim.currency,
  };
}
