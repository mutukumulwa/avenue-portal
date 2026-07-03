// Payment-SLA resolution for claims (TPA_FEEDBACK_WORKPLAN.md WP-A1, decision D2).
//
// SLA source is contract-first: when the claim was priced against a provider
// contract, that contract's payment terms (paymentTermDays / paymentTermType)
// define the pay-by deadline. Only when no contract matched do we fall back to
// serviceType defaults: outpatient-class claims pay within 24 hours; inpatient
// runs on a weekly settlement cycle with a 30-day hard ceiling.
//
// Keep this the ONLY place SLA hours are defined — never hard-code them in JSX.

export type SlaClass = "CONTRACT" | "OP_24H" | "IP_WEEKLY";

export interface ContractSlaTerms {
  paymentTermDays: number;
  paymentTermType: "CALENDAR" | "BUSINESS";
}

export interface SlaSpec {
  class: SlaClass;
  /** Pay-by target in hours from receipt. */
  payWithinHours: number;
  /** Absolute ceiling in hours — breach past this is critical. */
  hardCeilingHours: number;
  label: string;
}

export interface SlaState {
  ageHours: number;
  /** Hours until the pay-by target; negative = overdue. */
  dueInHours: number;
  /** Past the pay-by target. */
  breached: boolean;
  /** Past the hard ceiling. */
  critical: boolean;
  spec: SlaSpec;
}

const HOURS_PER_DAY = 24;
// BUSINESS days → calendar approximation: 5 working days span 7 calendar days.
// Documented trade-off (WP-A1): a calendar-ratio approximation keeps the helper
// pure (no holiday calendar dependency) and errs slightly generous to the payer.
const BUSINESS_DAY_FACTOR = 7 / 5;

const OP_DEFAULT: SlaSpec = {
  class: "OP_24H",
  payWithinHours: 24,
  hardCeilingHours: 72,
  label: "Outpatient — pay in 24 h",
};

const IP_DEFAULT: SlaSpec = {
  class: "IP_WEEKLY",
  payWithinHours: 7 * HOURS_PER_DAY,
  hardCeilingHours: 30 * HOURS_PER_DAY,
  label: "Inpatient — weekly cycle",
};

/** serviceType values that follow the outpatient 24-hour payment SLA. */
const OP_CLASS_SERVICE_TYPES = new Set(["OUTPATIENT", "DAY_CASE", "EMERGENCY"]);

export function slaFor(input: {
  serviceType: string;
  contractTerms?: ContractSlaTerms | null;
}): SlaSpec {
  const { serviceType, contractTerms } = input;

  if (contractTerms && contractTerms.paymentTermDays > 0) {
    const calendarDays =
      contractTerms.paymentTermType === "BUSINESS"
        ? Math.ceil(contractTerms.paymentTermDays * BUSINESS_DAY_FACTOR)
        : contractTerms.paymentTermDays;
    const payWithinHours = calendarDays * HOURS_PER_DAY;
    return {
      class: "CONTRACT",
      payWithinHours,
      // Ceiling: contract deadline plus a one-week grace, never below 30 days
      // for inpatient-class claims (the TPA's stated outer bound).
      hardCeilingHours: Math.max(
        payWithinHours + 7 * HOURS_PER_DAY,
        OP_CLASS_SERVICE_TYPES.has(serviceType) ? 0 : IP_DEFAULT.hardCeilingHours,
      ),
      label: `Contract — pay in ${calendarDays} d`,
    };
  }

  return OP_CLASS_SERVICE_TYPES.has(serviceType) ? OP_DEFAULT : IP_DEFAULT;
}

export function slaState(input: {
  receivedAt: Date | string;
  serviceType: string;
  contractTerms?: ContractSlaTerms | null;
  now?: Date;
}): SlaState {
  const spec = slaFor(input);
  const now = input.now ?? new Date();
  const ageHours = Math.floor(
    (now.getTime() - new Date(input.receivedAt).getTime()) / 3_600_000,
  );
  const dueInHours = spec.payWithinHours - ageHours;
  return {
    ageHours,
    dueInHours,
    breached: ageHours > spec.payWithinHours,
    critical: ageHours > spec.hardCeilingHours,
    spec,
  };
}
