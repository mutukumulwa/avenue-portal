// ─── CONTRACT RULE ENGINE — SHARED TYPES (spec §6) ───────────────────────────
// The engine is pure/deterministic and read-only. Every stage returns an
// outcome, an optional reason code, an optional rule ref, and a trace fragment.

export type LineDecision = "AUTO_APPROVED" | "APPROVED_WITH_ADJUSTMENT" | "DECLINED" | "PENDED";

export interface TraceStep {
  stage: string; // "MATCH" | "VALIDITY" | "MAPPING" | "PRICING" | "DECISION"
  outcome: string;
  reasonCode?: string;
  ruleRef?: string;
  detail?: string;
}

export interface EngineLineInput {
  id: string;
  cptCode?: string | null;
  providerServiceCode?: string | null;
  description: string;
  serviceCategory?: string | null;
  icdCode?: string | null;
  quantity: number;
  unitCost: number;
  billedAmount: number;
}

export interface EngineLineResult {
  lineId: string;
  decision: LineDecision;
  matchedRuleType: string | null; // CONTRACT_TARIFF | STANDALONE_TARIFF | UNLISTED_* | EXCLUDED | NO_CONTRACT | RATE_MISSING | DEFERRED
  matchedRuleId: string | null;
  matchMethod: string | null; // CODE | DESCRIPTION | ALIAS | MAPPING_MEMORY | FUZZY | UNLISTED | NONE
  payableSource: string | null; // human-readable label
  reasonCode: string | null;

  contractedAmount: number | null;
  payableAmount: number;
  shortfallAmount: number;
  disallowedAmount: number;
  memberLiability: number;
  payerLiability: number;
  providerWriteOff: number;
  externalRebateAmount?: number | null; // NET_OF_EXTERNAL gross-up offset (§5.7 P3/P12)
  quantityApproved: number | null;

  trace: TraceStep[];
}

export interface EnginePreauthApproval {
  approvedAmount?: number | null;
  validFrom?: Date | null;
  validUntil?: Date | null;
  serviceCodes?: string[]; // codes/descriptions the approval covers
  isEmergency?: boolean;
}

export interface EngineClaimContext {
  tenantId: string;
  providerId: string;
  providerBranchId?: string | null;
  clientId?: string | null;
  serviceType?: string | null; // OUTPATIENT | INPATIENT | ...
  dateOfService: Date;
  admissionDate?: Date | null;
  dischargeDate?: Date | null;
  submissionDate?: Date | null; // receivedAt — for submission-window check (stage 8)
  lengthOfStay?: number | null;
  isEmergency?: boolean; // emergency-exemption for pre-auth (§6.6)
  hasReferral?: boolean; // referral present — for requiresReferral / SHA self-referral (EXC-004)
  preauth?: EnginePreauthApproval | null; // linked approval (Claim.preauthId)
  attachedDocumentTypes?: string[]; // ContractDocumentType names present on the claim
  lines: EngineLineInput[];
}

export interface EngineClaimResult {
  matched: boolean;
  contractId: string | null;
  contractNumber: string | null;
  contractVersionId: string | null;
  contractFamilyIds: string[];
  reasonCode: string | null; // claim-level (e.g. CON-001 when nothing matched)
  claimDecision: "AUTO_APPROVED" | "PARTIALLY_APPROVED" | "DECLINED" | "UNDER_REVIEW";
  assignedQueue: string | null;
  avgCostPoolTag: string | null; // AVERAGE_COST_POOL claim tag (§6.4, reconciliation)
  submissionLate: boolean; // SUB-001 flagged at claim level
  totals: {
    billed: number;
    contracted: number;
    payable: number;
    shortfall: number;
    disallowed: number;
    memberLiability: number;
    providerWriteOff: number;
  };
  lines: EngineLineResult[];
  trace: TraceStep[]; // claim-level (matching/validity)
}
