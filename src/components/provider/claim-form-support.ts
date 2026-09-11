/**
 * Family Hospital UAT plan P04 — small pure helpers the provider claim and
 * pre-authorisation forms share, so each form stays an adapter over the shared
 * controls (P03: "Do not duplicate new controls in each form").
 */
import type { MutationFailure } from "@/lib/mutation-contract";
import type { CaseContextOutcome, CaseContextDTO } from "@/lib/provider-capture-contract";
import type { CaptureLineState } from "./ServiceLineEditor";

/** The first message per field, the shape the capture controls take. */
export function firstErrors(failure: MutationFailure | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, messages] of Object.entries(failure?.fieldErrors ?? {})) {
    if (messages[0]) out[field] = messages[0];
  }
  return out;
}

/**
 * Error-summary labels in the order the form reads, top to bottom: the case
 * fields, then each line's fields.
 */
export function claimFieldLabels(lines: CaptureLineState[], mode: "claim" | "estimate" = "claim"): Record<string, string> {
  const labels: Record<string, string> = {
    member: "Member",
    serviceDate: "Date of service",
    benefitCategory: "Benefit",
    serviceType: "Service type",
    attendingDoctor: "Attending clinician",
    diagnosis: "Primary diagnosis",
    lines: "Services",
  };
  lines.forEach((_, i) => {
    const n = i + 1;
    labels[`lines.${i}.category`] = `Line ${n} category`;
    labels[`lines.${i}.service`] = `Line ${n} service`;
    labels[`lines.${i}.description`] = `Line ${n} service description`;
    labels[`lines.${i}.quantity`] = `Line ${n} quantity`;
    labels[`lines.${i}.billedUnitPrice`] = `Line ${n} ${mode === "estimate" ? "estimated unit cost" : "billed unit price"}`;
  });
  return labels;
}

/** Why services cannot be added yet, in words — or undefined for the default prompt. */
export function disabledLinesReason(state: { context: CaseContextDTO | null; outcome: CaseContextOutcome | null }): string | undefined {
  switch (state.outcome) {
    case "INELIGIBLE":
      return "This member is not eligible on this date, so services cannot be added.";
    case "NO_ACTIVE_CONTRACT":
    case "AMBIGUOUS_CONTRACT":
      return "No contract price can be applied for this patient at this branch on this date. Contact Medvex.";
    case "BRANCH_REQUIRED":
      return "Choose the branch where the patient is being seen.";
    default:
      return undefined;
  }
}
