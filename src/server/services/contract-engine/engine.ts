import { prisma } from "@/lib/prisma";
import { ContractLifecycleService } from "../contract-lifecycle.service";
import type {
  EngineClaimContext,
  EngineClaimResult,
  EngineLineInput,
  EngineLineResult,
  TraceStep,
} from "./types";
import type { ProviderContract, ProviderTariff } from "@prisma/client";

// ─── CONTRACT RULE ENGINE (spec §6) ──────────────────────────────────────────
// Phase 2 implements stages 1–4 + 9: contract matching, validity, service
// mapping (code → alias/memory → fuzzy-with-memory → unlisted), pricing for
// FIXED / DISCOUNT_OFF_BILLED / MARKUP_OVER_COST / PER_DIEM with LOWER_OF
// default and caps, and decision synthesis with reason codes and a rule trace.
// Read-only and deterministic: same inputs ⇒ same trace.

const FUZZY_THRESHOLD = 0.92;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/** Dice coefficient over word-bigrams — cheap, deterministic string similarity. */
function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const bigrams = (s: string) => {
    const grams = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      grams.set(g, (grams.get(g) ?? 0) + 1);
    }
    return grams;
  };
  const ga = bigrams(na);
  const gb = bigrams(nb);
  let overlap = 0;
  for (const [g, c] of ga) overlap += Math.min(c, gb.get(g) ?? 0);
  const total = na.length - 1 + (nb.length - 1);
  return total > 0 ? (2 * overlap) / total : 0;
}

export class ContractEngine {
  /**
   * Load a claim by id and evaluate it (read-only). Convenience wrapper over
   * `evaluateClaim` for the claims panel and sandbox. Uses structured ClaimLines
   * when present, otherwise the claim's `procedures` JSON.
   */
  static async evaluateClaimById(tenantId: string, claimId: string): Promise<EngineClaimResult | null> {
    const claim = await prisma.claim.findUnique({
      where: { id: claimId, tenantId },
      include: { claimLines: { orderBy: { lineNumber: "asc" } }, member: { select: { groupId: true } } },
    });
    if (!claim) return null;

    // Resolve the payer (clientId) via the member's group when available.
    let clientId: string | null = null;
    if (claim.member?.groupId) {
      const group = await prisma.group.findUnique({ where: { id: claim.member.groupId }, select: { clientId: true } });
      clientId = group?.clientId ?? null;
    }

    let lines: EngineLineInput[];
    if (claim.claimLines.length > 0) {
      lines = claim.claimLines.map(l => ({
        id: l.id,
        cptCode: l.cptCode,
        providerServiceCode: null,
        description: l.description,
        serviceCategory: l.serviceCategory,
        icdCode: l.icdCode,
        quantity: l.quantity,
        unitCost: Number(l.unitCost),
        billedAmount: Number(l.billedAmount),
      }));
    } else {
      const procs = (claim.procedures as unknown as Array<{ cptCode?: string; description?: string; qty?: number; quantity?: number; unitCost?: number; total?: number }>) ?? [];
      lines = procs.map((p, i) => {
        const qty = p.qty ?? p.quantity ?? 1;
        const unit = p.unitCost ?? 0;
        return {
          id: `proc-${i}`,
          cptCode: p.cptCode ?? null,
          providerServiceCode: null,
          description: p.description ?? "",
          serviceCategory: null,
          icdCode: null,
          quantity: qty,
          unitCost: unit,
          billedAmount: p.total ?? unit * qty,
        };
      });
    }

    return this.evaluateClaim({
      tenantId,
      providerId: claim.providerId,
      providerBranchId: claim.providerBranchId,
      clientId,
      serviceType: claim.serviceType,
      dateOfService: claim.dateOfService,
      admissionDate: claim.admissionDate,
      lengthOfStay: claim.lengthOfStay,
      lines,
    });
  }

  /**
   * Evaluate a whole claim against the matched contract. Pure/read-only —
   * returns amounts, per-line decisions, reason codes, and a full trace. Does
   * NOT persist; the adjudication integration writes the result to ClaimLine.
   */
  static async evaluateClaim(ctx: EngineClaimContext): Promise<EngineClaimResult> {
    const trace: TraceStep[] = [];
    const pricingDate = ctx.admissionDate ?? ctx.dateOfService; // §6.1.1

    // ── Stages 1–2: match + validity ──
    const match = await ContractLifecycleService.precheck({
      tenantId: ctx.tenantId,
      providerId: ctx.providerId,
      providerBranchId: ctx.providerBranchId,
      clientId: ctx.clientId,
      pricingDate,
    });

    if (!match.matched || !match.contract) {
      trace.push({ stage: "MATCH", outcome: "NO_MATCH", reasonCode: match.reasonCode, detail: match.message });
      return this.noContractResult(ctx, match.reasonCode ?? "CON-001", match.reasonCode === "CON-010" ? "RATE_AMBIGUITY" : "NO_CONTRACT", trace);
    }
    trace.push({ stage: "MATCH", outcome: "MATCHED", ruleRef: match.contract.id, detail: `${match.contract.contractNumber} v?` });

    const contract = await prisma.providerContract.findUnique({ where: { id: match.contract.id } });
    if (!contract) return this.noContractResult(ctx, "CON-001", "NO_CONTRACT", trace);
    trace.push({ stage: "VALIDITY", outcome: "OK", detail: `status ${contract.status}` });

    // Load candidate tariff lines effective on the pricing date for this contract
    // (branch-specific or network-wide), plus mapping memories.
    const tariffs = await prisma.providerTariff.findMany({
      where: {
        contractId: contract.id,
        isActive: true,
        effectiveFrom: { lte: pricingDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: pricingDate } }],
        AND: [
          { OR: [{ branchId: ctx.providerBranchId ?? undefined }, { branchId: null }] },
          { OR: [{ clientId: ctx.clientId ?? null }, { clientId: null }] },
        ],
      },
    });
    const memories = await prisma.serviceMappingMemory.findMany({
      where: { tenantId: ctx.tenantId, OR: [{ contractId: contract.id }, { contractId: null }], tariffId: { in: tariffs.map(t => t.id) } },
    });
    const memoryByText = new Map<string, string>();
    for (const m of memories) memoryByText.set(m.normalizedText, m.tariffId);

    // Load Phase-3 rule sets effective on the pricing date.
    const dateWindow = { effectiveFrom: { lte: pricingDate }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: pricingDate } }] };
    const [packages, pricingRules, exclusions, preauthRules] = await Promise.all([
      prisma.contractPackage.findMany({ where: { contractId: contract.id, isActive: true, ...dateWindow }, include: { components: true } }),
      prisma.pricingRule.findMany({ where: { contractId: contract.id, isActive: true, ...dateWindow } }),
      prisma.providerContractExclusion.findMany({ where: { contractId: contract.id } }),
      prisma.preauthRule.findMany({ where: { contractId: contract.id, isActive: true, ...dateWindow } }),
    ]);

    const inputById = new Map(ctx.lines.map(l => [l.id, l]));
    let avgCostPoolTag: string | null = null;
    let lineResults: EngineLineResult[];

    // Contract-level pricing model (spec §5.7): a PER_VISIT_CASE_RATE or
    // AVERAGE_COST_POOL rule changes how the whole claim prices.
    const caseRateRule = pricingRules.find(r => r.scope === "CONTRACT" && r.ruleKind === "PER_VISIT_CASE_RATE");
    const avgPoolRule = pricingRules.find(r => r.scope === "CONTRACT" && r.ruleKind === "AVERAGE_COST_POOL");

    if (caseRateRule) {
      lineResults = this.applyCaseRate(ctx, contract, tariffs, memoryByText, caseRateRule);
    } else if (avgPoolRule) {
      const r = this.applyAverageCostPool(ctx, avgPoolRule);
      lineResults = r.lines;
      avgCostPoolTag = r.poolTag;
    } else {
      lineResults = ctx.lines.map(line => this.evaluateLine(line, contract, tariffs, memoryByText, ctx));
      // ── Stage 5: coverage & exclusions (runs after pricing for dispute value) ──
      for (const lr of lineResults) {
        const input = inputById.get(lr.lineId);
        if (input) this.applyExclusions(lr, input, contract, exclusions, tariffs, ctx);
      }
      // ── Stage 8: package assembly (may override itemised lines) ──
      lineResults = this.assemblePackages(lineResults, ctx, packages, contract);
    }

    // ── Stage 6: pre-authorisation (per real line) ──
    for (const lr of lineResults) {
      const input = inputById.get(lr.lineId);
      if (input) this.applyPreauth(lr, input, ctx, preauthRules);
    }

    // ── Stage 8: submission-window check (claim-level, §8.4) ──
    const submissionLate = this.checkSubmissionWindow(contract, ctx);
    if (submissionLate) trace.push({ stage: "DECISION", outcome: "LATE_SUBMISSION", reasonCode: "SUB-001" });

    // ── Stage 9: decision synthesis ──
    const totals = lineResults.reduce(
      (acc, l) => {
        acc.billed += l.lineId ? (ctx.lines.find(x => x.id === l.lineId)?.billedAmount ?? 0) : 0;
        acc.contracted += l.contractedAmount ?? 0;
        acc.payable += l.payableAmount;
        acc.shortfall += l.shortfallAmount;
        acc.disallowed += l.disallowedAmount;
        acc.memberLiability += l.memberLiability;
        acc.providerWriteOff += l.providerWriteOff;
        return acc;
      },
      { billed: 0, contracted: 0, payable: 0, shortfall: 0, disallowed: 0, memberLiability: 0, providerWriteOff: 0 },
    );

    const anyPend = lineResults.some(l => l.decision === "PENDED") || submissionLate;
    const allDeclined = lineResults.length > 0 && lineResults.every(l => l.decision === "DECLINED");
    const anyAdjustOrDecline = lineResults.some(l => l.decision === "APPROVED_WITH_ADJUSTMENT" || l.decision === "DECLINED");

    let claimDecision: EngineClaimResult["claimDecision"];
    let assignedQueue: string | null = null;
    let claimReason: string | null = null;
    if (anyPend) {
      claimDecision = "UNDER_REVIEW";
      const firstPend = lineResults.find(l => l.decision === "PENDED");
      if (firstPend?.reasonCode) {
        assignedQueue = this.queueForReason(firstPend.reasonCode);
      } else if (submissionLate) {
        assignedQueue = "MISSING_DOCS";
        claimReason = "SUB-001";
      }
    } else if (allDeclined) {
      claimDecision = "DECLINED";
    } else if (anyAdjustOrDecline) {
      claimDecision = "PARTIALLY_APPROVED";
    } else {
      claimDecision = "AUTO_APPROVED";
    }

    return {
      matched: true,
      contractId: contract.id,
      contractNumber: contract.contractNumber,
      contractVersionId: contract.currentVersionId,
      contractFamilyIds: contract.parentContractId ? [contract.parentContractId, contract.id] : [contract.id],
      reasonCode: claimReason,
      claimDecision,
      assignedQueue,
      avgCostPoolTag,
      submissionLate,
      totals: {
        billed: round2(totals.billed),
        contracted: round2(totals.contracted),
        payable: round2(totals.payable),
        shortfall: round2(totals.shortfall),
        disallowed: round2(totals.disallowed),
        memberLiability: round2(totals.memberLiability),
        providerWriteOff: round2(totals.providerWriteOff),
      },
      lines: lineResults,
      trace,
    };
  }

  // ── Stage 3 (mapping) + Stage 4 (pricing) for one line ──
  private static evaluateLine(
    line: EngineLineInput,
    contract: ProviderContract,
    tariffs: ProviderTariff[],
    memoryByText: Map<string, string>,
    ctx: EngineClaimContext,
  ): EngineLineResult {
    const trace: TraceStep[] = [];
    const base: EngineLineResult = {
      lineId: line.id,
      decision: "PENDED",
      matchedRuleType: null,
      matchedRuleId: null,
      matchMethod: null,
      payableSource: null,
      reasonCode: null,
      contractedAmount: null,
      payableAmount: 0,
      shortfallAmount: 0,
      disallowedAmount: 0,
      memberLiability: 0,
      payerLiability: 0,
      providerWriteOff: 0,
      quantityApproved: null,
      trace,
    };

    // ── Stage 3: service mapping ──
    let tariff: ProviderTariff | undefined;
    let method: string | null = null;

    // 1. Code match (branch-specific beats network — sort branch rows first).
    const byCode = tariffs
      .filter(t => (line.cptCode && t.cptCode === line.cptCode) || (line.providerServiceCode && t.providerServiceCode === line.providerServiceCode))
      .sort((a, b) => (a.branchId ? 0 : 1) - (b.branchId ? 0 : 1));
    if (byCode.length > 0) {
      tariff = byCode[0];
      method = "CODE";
    }

    // 2. Exact normalized description match.
    if (!tariff) {
      const nd = normalize(line.description);
      const exact = tariffs.find(t =>
        normalize(t.serviceName) === nd ||
        (t.standardDescription && normalize(t.standardDescription) === nd) ||
        (t.providerDescription && normalize(t.providerDescription) === nd),
      );
      if (exact) { tariff = exact; method = "DESCRIPTION"; }
    }

    // 3. Mapping memory (maker-confirmed) then fuzzy (auto-usable only if memory-confirmed).
    if (!tariff) {
      const nd = normalize(line.description);
      const memTariffId = memoryByText.get(nd);
      if (memTariffId) {
        tariff = tariffs.find(t => t.id === memTariffId);
        if (tariff) method = "MAPPING_MEMORY";
      }
      if (!tariff) {
        let best: { t: ProviderTariff; score: number } | null = null;
        for (const t of tariffs) {
          const score = Math.max(
            similarity(line.description, t.serviceName),
            t.standardDescription ? similarity(line.description, t.standardDescription) : 0,
          );
          if (!best || score > best.score) best = { t, score };
        }
        if (best && best.score >= FUZZY_THRESHOLD && memoryByText.has(normalize(best.t.serviceName))) {
          tariff = best.t;
          method = "FUZZY";
        } else if (best && best.score >= FUZZY_THRESHOLD) {
          // Fuzzy hit but not confirmed — route for human confirmation (SVC-002).
          trace.push({ stage: "MAPPING", outcome: "FUZZY_UNCONFIRMED", reasonCode: "SVC-002", ruleRef: best.t.id, detail: `≈${best.score.toFixed(2)} to "${best.t.serviceName}"` });
        }
      }
    }

    if (tariff) {
      trace.push({ stage: "MAPPING", outcome: "MAPPED", ruleRef: tariff.id, detail: `${method}: ${tariff.serviceName}` });
      return this.priceMapped(line, contract, tariff, method, base, trace, ctx.lengthOfStay ?? null);
    }

    // 4. Unlisted-service rule (§6.3.5).
    trace.push({ stage: "MAPPING", outcome: "UNMAPPED", detail: "no tariff match" });
    return this.priceUnlisted(line, contract, base, trace);
  }

  // ── Stage 4: price a mapped line ──
  private static priceMapped(
    line: EngineLineInput,
    contract: ProviderContract,
    tariff: ProviderTariff,
    method: string | null,
    base: EngineLineResult,
    trace: TraceStep[],
    lengthOfStay: number | null,
  ): EngineLineResult {
    base.matchedRuleId = tariff.id;
    base.matchMethod = method;
    base.matchedRuleType = tariff.contractId ? "CONTRACT_TARIFF" : "STANDALONE_TARIFF";
    base.payableSource = `Tariff "${tariff.serviceName}" (${tariff.rateType})`;

    // Rate-missing line → manual pricing (PRC-002).
    if (tariff.rateMissing) {
      trace.push({ stage: "PRICING", outcome: "RATE_MISSING", reasonCode: "PRC-002", ruleRef: tariff.id });
      base.decision = "PENDED";
      base.reasonCode = "PRC-002";
      base.matchedRuleType = "RATE_MISSING";
      return base;
    }

    const rate = Number(tariff.agreedRate);
    const qty = Math.max(1, line.quantity);

    // Rate types deferred to Phase 3 route to manual with a trace note.
    if (["EXTERNAL_TARIFF_REF", "NET_OF_EXTERNAL", "CAPITATION", "AVERAGE_COST_POOL"].includes(tariff.rateType)) {
      trace.push({ stage: "PRICING", outcome: "DEFERRED_RATE_TYPE", reasonCode: "MAN-001", ruleRef: tariff.id, detail: tariff.rateType });
      base.decision = "PENDED";
      base.reasonCode = "MAN-001";
      base.matchedRuleType = "DEFERRED";
      return base;
    }

    // Quantity caps (§6.4).
    const cap = tariff.quantityLimit ?? tariff.maxQuantityPerVisit ?? null;
    const qtyApproved = cap != null ? Math.min(qty, cap) : qty;
    const qtyOver = qtyApproved < qty;

    // Base rate computation by rate type.
    let contracted: number;
    switch (tariff.rateType) {
      case "PER_DIEM": {
        // Length-of-stay drives per-diem: explicit LOS, else billed quantity, else 1.
        const days = Math.max(1, lengthOfStay ?? line.quantity ?? 1);
        contracted = rate * days;
        base.payableSource = `Per-diem ${rate} × ${days}d`;
        break;
      }
      case "DISCOUNT_OFF_BILLED": {
        const pct = tariff.discountPct != null ? Number(tariff.discountPct) : 0;
        contracted = line.unitCost * qtyApproved * (1 - pct / 100);
        base.payableSource = `Billed − ${pct}%`;
        break;
      }
      case "MARKUP_OVER_COST": {
        const pct = tariff.markupPct != null ? Number(tariff.markupPct) : 0;
        contracted = line.unitCost * qtyApproved * (1 + pct / 100);
        base.payableSource = `Cost + ${pct}%`;
        break;
      }
      case "FIXED":
      default:
        contracted = rate * qtyApproved;
        break;
    }
    contracted = round2(contracted);

    // Apply min/max payable combinators (§6.4 ordering: base → floor → ceiling).
    if (tariff.minPayableAmount != null) contracted = Math.max(contracted, Number(tariff.minPayableAmount));
    if (tariff.maxPayableAmount != null) contracted = Math.min(contracted, Number(tariff.maxPayableAmount));
    contracted = round2(contracted);

    base.contractedAmount = contracted;
    base.quantityApproved = qtyApproved;

    // LOWER_OF default: pay min(billed-for-approved-qty, contracted).
    const billedForApprovedQty = round2(line.unitCost * qtyApproved);
    const payable = round2(Math.min(billedForApprovedQty, contracted));
    base.payableAmount = payable;
    base.payerLiability = payable;

    // Excess quantity is disallowed (LIM-001).
    const excessQtyAmount = qtyOver ? round2(line.unitCost * (qty - qtyApproved)) : 0;

    // Shortfall = billed (full) − payable − disallowed-excess.
    const shortfall = round2(Math.max(0, line.billedAmount - payable - excessQtyAmount));
    base.disallowedAmount = excessQtyAmount;

    // Reason + decision.
    if (qtyOver) {
      trace.push({ stage: "PRICING", outcome: "QTY_CAPPED", reasonCode: "LIM-001", ruleRef: tariff.id, detail: `qty ${qty}→${qtyApproved}` });
      base.reasonCode = "LIM-001";
    }
    if (shortfall > 0) {
      // Billed above contracted → short-pay to contract (PRC-001).
      this.absorbShortfall(base, contract, shortfall);
      if (!base.reasonCode) base.reasonCode = "PRC-001";
      base.decision = "APPROVED_WITH_ADJUSTMENT";
      trace.push({ stage: "PRICING", outcome: "SHORTFALL", reasonCode: base.reasonCode, ruleRef: tariff.id, detail: `billed ${line.billedAmount} → payable ${payable}` });
    } else if (qtyOver) {
      base.decision = "APPROVED_WITH_ADJUSTMENT";
      this.absorbShortfall(base, contract, 0); // excess already in disallowed
    } else {
      base.decision = "AUTO_APPROVED";
      trace.push({ stage: "PRICING", outcome: "PAID", ruleRef: tariff.id, detail: `payable ${payable}` });
    }
    // Excess-quantity amount is a provider write-off (or member liability where allowed).
    if (excessQtyAmount > 0) {
      if (this.memberPays(contract)) base.memberLiability = round2(base.memberLiability + excessQtyAmount);
      else base.providerWriteOff = round2(base.providerWriteOff + excessQtyAmount);
    }

    return base;
  }

  // ── Stage 4: price an unmapped line via the contract's unlisted rule ──
  private static priceUnlisted(line: EngineLineInput, contract: ProviderContract, base: EngineLineResult, trace: TraceStep[]): EngineLineResult {
    base.matchMethod = "UNLISTED";
    switch (contract.unlistedServiceRule) {
      case "PAY_AS_BILLED":
        base.matchedRuleType = "UNLISTED_PAY_AS_BILLED";
        base.payableSource = "Unlisted — pay as billed";
        base.payableAmount = round2(line.billedAmount);
        base.payerLiability = base.payableAmount;
        base.decision = "AUTO_APPROVED";
        trace.push({ stage: "PRICING", outcome: "UNLISTED_PAY_AS_BILLED", detail: `payable ${base.payableAmount}` });
        return base;
      case "DISCOUNT_OFF_BILLED": {
        const pct = contract.unlistedDiscountPct != null ? Number(contract.unlistedDiscountPct) : 0;
        base.matchedRuleType = "UNLISTED_DISCOUNT";
        base.payableSource = `Unlisted — billed − ${pct}%`;
        base.payableAmount = round2(line.billedAmount * (1 - pct / 100));
        base.payerLiability = base.payableAmount;
        const shortfall = round2(line.billedAmount - base.payableAmount);
        if (shortfall > 0) { this.absorbShortfall(base, contract, shortfall); base.reasonCode = "PRC-001"; base.decision = "APPROVED_WITH_ADJUSTMENT"; }
        else base.decision = "AUTO_APPROVED";
        trace.push({ stage: "PRICING", outcome: "UNLISTED_DISCOUNT", detail: `payable ${base.payableAmount}` });
        return base;
      }
      case "REJECT":
        base.matchedRuleType = "UNLISTED_REJECT";
        base.payableSource = "Unlisted — not payable";
        base.reasonCode = "SVC-003";
        base.decision = "DECLINED";
        base.disallowedAmount = round2(line.billedAmount);
        if (this.memberPays(contract)) base.memberLiability = base.disallowedAmount; else base.providerWriteOff = base.disallowedAmount;
        trace.push({ stage: "PRICING", outcome: "UNLISTED_REJECT", reasonCode: "SVC-003" });
        return base;
      case "REFER_FOR_REVIEW":
      default:
        base.matchedRuleType = "UNLISTED_REFER";
        base.payableSource = "Unlisted — refer for review";
        base.reasonCode = "SVC-002";
        base.decision = "PENDED";
        trace.push({ stage: "PRICING", outcome: "UNLISTED_REFER", reasonCode: "SVC-002" });
        return base;
    }
  }

  /** Route a shortfall to provider write-off (default) or member liability. */
  private static absorbShortfall(base: EngineLineResult, contract: ProviderContract, shortfall: number) {
    base.shortfallAmount = round2(base.shortfallAmount + shortfall);
    if (shortfall <= 0) return;
    if (this.memberPays(contract)) base.memberLiability = round2(base.memberLiability + shortfall);
    else base.providerWriteOff = round2(base.providerWriteOff + shortfall);
  }

  /** Whether the shortfall may be billed to the member (§6.4, O19). */
  private static memberPays(contract: ProviderContract): boolean {
    return contract.balanceBillingPolicy === "ALLOWED";
  }

  private static queueForReason(reasonCode: string | null): string | null {
    if (!reasonCode) return "MEDICAL_REVIEW";
    if (reasonCode.startsWith("CON-")) return reasonCode === "CON-010" ? "RATE_AMBIGUITY" : "NO_CONTRACT";
    if (reasonCode === "SVC-002") return "SERVICE_NOT_MAPPED";
    if (reasonCode === "PRC-002") return "RATE_MISSING";
    if (reasonCode === "PRC-004") return "RATE_AMBIGUITY";
    if (reasonCode === "MAN-001") return "CONTRACT_AMENDMENT_REQUIRED";
    if (reasonCode.startsWith("AUTH-")) return "MISSING_PREAUTH";
    if (reasonCode.startsWith("DOC-") || reasonCode === "SUB-001") return "MISSING_DOCS";
    if (reasonCode === "EXC-004") return "MEDICAL_REVIEW";
    return "MEDICAL_REVIEW";
  }

  private static noContractResult(ctx: EngineClaimContext, reasonCode: string, queue: string, trace: TraceStep[]): EngineClaimResult {
    const lines: EngineLineResult[] = ctx.lines.map(l => ({
      lineId: l.id,
      decision: "PENDED",
      matchedRuleType: "NO_CONTRACT",
      matchedRuleId: null,
      matchMethod: "NONE",
      payableSource: null,
      reasonCode,
      contractedAmount: null,
      payableAmount: 0,
      shortfallAmount: 0,
      disallowedAmount: 0,
      memberLiability: 0,
      payerLiability: 0,
      providerWriteOff: 0,
      quantityApproved: null,
      trace: [{ stage: "MAPPING", outcome: "NO_CONTRACT", reasonCode }],
    }));
    const billed = round2(ctx.lines.reduce((s, l) => s + l.billedAmount, 0));
    return {
      matched: false,
      contractId: null,
      contractNumber: null,
      contractVersionId: null,
      contractFamilyIds: [],
      reasonCode,
      claimDecision: "UNDER_REVIEW",
      assignedQueue: queue,
      avgCostPoolTag: null,
      submissionLate: false,
      totals: { billed, contracted: 0, payable: 0, shortfall: 0, disallowed: 0, memberLiability: 0, providerWriteOff: 0 },
      lines,
      trace,
    };
  }

  // ── Stage 5: coverage & exclusions (spec §6.5) ──
  // Runs after pricing so the trace shows what would have been paid. Contract
  // exclusions and referral requirements reject/zero the line.
  private static applyExclusions(
    lr: EngineLineResult,
    input: EngineLineInput,
    contract: ProviderContract,
    exclusions: Array<{ level: string; cptCode: string | null; serviceName: string; icdCodes: string[]; memberCategory: string | null; dateFrom: Date | null; dateTo: Date | null }>,
    tariffs: ProviderTariff[],
    ctx: EngineClaimContext,
  ) {
    const nd = normalize(input.description);
    // Referral requirement on the mapped tariff (SHA imaging self-referral ban → EXC-004).
    const mapped = lr.matchedRuleId ? tariffs.find(t => t.id === lr.matchedRuleId) : undefined;
    if (mapped?.requiresReferral && !ctx.hasReferral) {
      this.declineLine(lr, contract, input, "EXC-004", "Referral required — self-referral not covered");
      return;
    }
    for (const ex of exclusions) {
      let hit = false;
      let code = "EXC-001";
      if (ex.level === "DIAGNOSIS") {
        if (input.icdCode && ex.icdCodes.includes(input.icdCode)) { hit = true; code = "EXC-002"; }
      } else if (ex.level === "DATE_RANGE") {
        const d = ctx.dateOfService;
        if ((!ex.dateFrom || d >= ex.dateFrom) && (!ex.dateTo || d <= ex.dateTo)) { hit = true; code = "EXC-003"; }
      } else {
        // CONTRACT / CATEGORY / TARIFF_LINE / PLAN / MEMBER_CATEGORY — match by code or name.
        if ((ex.cptCode && input.cptCode && ex.cptCode === input.cptCode) || (ex.serviceName && normalize(ex.serviceName) === nd)) hit = true;
      }
      if (hit) {
        this.declineLine(lr, contract, input, code, `Excluded by contract (${ex.level.toLowerCase()})`);
        return;
      }
    }
  }

  private static declineLine(lr: EngineLineResult, contract: ProviderContract, input: EngineLineInput, reasonCode: string, note: string) {
    lr.decision = "DECLINED";
    lr.reasonCode = reasonCode;
    lr.payableAmount = 0;
    lr.payerLiability = 0;
    lr.shortfallAmount = 0;
    lr.disallowedAmount = round2(input.billedAmount);
    if (this.memberPays(contract)) { lr.memberLiability = lr.disallowedAmount; lr.providerWriteOff = 0; }
    else { lr.providerWriteOff = lr.disallowedAmount; lr.memberLiability = 0; }
    lr.trace.push({ stage: "EXCLUSION", outcome: "EXCLUDED", reasonCode, detail: note });
  }

  // ── Stage 6: pre-authorisation (spec §6.6) ──
  private static applyPreauth(
    lr: EngineLineResult,
    input: EngineLineInput,
    ctx: EngineClaimContext,
    rules: Array<{ triggerType: string; thresholdAmount: unknown; serviceRefs: string[]; emergencyExempt: boolean; retrospectiveAllowed: boolean; consequenceIfMissing: string; admissionRequired: boolean }>,
  ) {
    if (lr.decision === "DECLINED") return; // already rejected upstream
    const nd = normalize(input.description);
    const triggered = rules.find(r => {
      switch (r.triggerType) {
        case "ALWAYS": return true;
        case "SERVICE_LIST": return r.serviceRefs.some(s => (input.cptCode && s === input.cptCode) || normalize(s) === nd || nd.includes(normalize(s)));
        case "AMOUNT_THRESHOLD": return r.thresholdAmount != null && input.billedAmount > Number(r.thresholdAmount);
        case "ADMISSION": return (ctx.serviceType ?? "").toUpperCase() === "INPATIENT" || !!ctx.admissionDate;
        default: return false;
      }
    });
    if (!triggered) return;

    // Emergency exemption (SHA GCC 11.1, O17).
    if (triggered.emergencyExempt && ctx.isEmergency) {
      lr.trace.push({ stage: "PREAUTH", outcome: "EMERGENCY_EXEMPT", detail: triggered.retrospectiveAllowed ? "retro approval task" : "" });
      return;
    }

    const approval = ctx.preauth;
    if (!approval) {
      // Missing pre-auth → consequence.
      if (triggered.consequenceIfMissing === "PAY_WITH_PENALTY") {
        lr.trace.push({ stage: "PREAUTH", outcome: "MISSING_PAY_WITH_PENALTY", reasonCode: "AUTH-001" });
        return;
      }
      lr.reasonCode = "AUTH-001";
      lr.trace.push({ stage: "PREAUTH", outcome: "MISSING", reasonCode: "AUTH-001" });
      if (triggered.consequenceIfMissing === "REJECT") {
        lr.decision = "DECLINED";
        lr.disallowedAmount = round2(lr.payableAmount || input.billedAmount);
        lr.payableAmount = 0;
        lr.payerLiability = 0;
      } else {
        lr.decision = "PENDED";
        lr.payableAmount = 0;
        lr.payerLiability = 0;
      }
      return;
    }

    // Approval present — validity, coverage, amount checks.
    if ((approval.validFrom && ctx.dateOfService < approval.validFrom) || (approval.validUntil && ctx.dateOfService > approval.validUntil)) {
      lr.reasonCode = "AUTH-002"; lr.decision = "PENDED"; lr.payableAmount = 0;
      lr.trace.push({ stage: "PREAUTH", outcome: "EXPIRED", reasonCode: "AUTH-002" });
      return;
    }
    if (approval.serviceCodes && approval.serviceCodes.length > 0) {
      const covers = approval.serviceCodes.some(s => (input.cptCode && s === input.cptCode) || normalize(s) === nd);
      if (!covers) {
        lr.reasonCode = "AUTH-004"; lr.decision = "PENDED"; lr.payableAmount = 0;
        lr.trace.push({ stage: "PREAUTH", outcome: "NOT_COVERED", reasonCode: "AUTH-004" });
        return;
      }
    }
    if (approval.approvedAmount != null && lr.payableAmount > approval.approvedAmount) {
      const capped = round2(approval.approvedAmount);
      lr.shortfallAmount = round2(lr.shortfallAmount + (lr.payableAmount - capped));
      lr.payableAmount = capped; lr.payerLiability = capped;
      lr.reasonCode = "AUTH-003";
      lr.decision = "APPROVED_WITH_ADJUSTMENT";
      lr.trace.push({ stage: "PREAUTH", outcome: "AMOUNT_EXCEEDED", reasonCode: "AUTH-003" });
    }
  }

  // ── Stage 8: submission-window check (spec §8.4) ──
  private static checkSubmissionWindow(contract: ProviderContract, ctx: EngineClaimContext): boolean {
    if (!contract.submissionWindowDays || !ctx.submissionDate) return false;
    let basis: Date | null;
    switch (contract.submissionWindowBasis) {
      case "DISCHARGE_DATE": basis = ctx.dischargeDate ?? ctx.dateOfService; break;
      case "INVOICE_DATE": basis = ctx.dateOfService; break;
      case "MONTHLY_BATCH": return false;
      case "SERVICE_DATE":
      default: basis = ctx.dateOfService;
    }
    if (!basis) return false;
    const days = Math.floor((ctx.submissionDate.getTime() - basis.getTime()) / 86_400_000);
    return days > contract.submissionWindowDays;
  }

  // ── Stage 8: PER_VISIT_CASE_RATE (spec §5.7 P4, examples 2 & 3) ──
  // Non-carve-out lines fold into one fixed case-rate payable (AS_CONTRACTED);
  // carve-out lines price separately and go through pre-auth.
  private static applyCaseRate(
    ctx: EngineClaimContext,
    contract: ProviderContract,
    tariffs: ProviderTariff[],
    memoryByText: Map<string, string>,
    rule: { params: unknown },
  ): EngineLineResult[] {
    const params = (rule.params ?? {}) as { rate?: number; carveOutCodes?: string[]; carveOutDescriptions?: string[]; label?: string };
    const rate = Number(params.rate ?? 0);
    const carveCodes = new Set((params.carveOutCodes ?? []).map(c => c.toUpperCase()));
    const carveDescr = (params.carveOutDescriptions ?? []).map(d => normalize(d));

    const isCarveOut = (l: EngineLineInput) =>
      (l.cptCode && carveCodes.has(l.cptCode.toUpperCase())) ||
      carveDescr.some(d => normalize(l.description).includes(d));

    const results: EngineLineResult[] = [];
    for (const l of ctx.lines) {
      if (isCarveOut(l)) {
        // Price the carve-out normally (pre-auth applied later in stage 6).
        results.push(this.evaluateLine(l, contract, tariffs, memoryByText, ctx));
      } else {
        // Folded into the case rate — informational, zero payable.
        results.push({
          lineId: l.id, decision: "AUTO_APPROVED", matchedRuleType: "CASE_RATE_INCLUDED", matchedRuleId: null,
          matchMethod: "CASE_RATE", payableSource: "Included in per-visit case rate", reasonCode: "PRC-005",
          contractedAmount: 0, payableAmount: 0, shortfallAmount: 0, disallowedAmount: 0, memberLiability: 0,
          payerLiability: 0, providerWriteOff: 0, quantityApproved: null,
          trace: [{ stage: "PRICING", outcome: "CASE_RATE_INCLUDED", reasonCode: "PRC-005" }],
        });
      }
    }
    // Synthetic case-rate payable line (AS_CONTRACTED — paid regardless of billed).
    results.push({
      lineId: "case-rate", decision: "AUTO_APPROVED", matchedRuleType: "PER_VISIT_CASE_RATE", matchedRuleId: null,
      matchMethod: "CASE_RATE", payableSource: params.label ?? `Per-visit case rate ${rate}`, reasonCode: null,
      contractedAmount: round2(rate), payableAmount: round2(rate), shortfallAmount: 0, disallowedAmount: 0,
      memberLiability: 0, payerLiability: round2(rate), providerWriteOff: 0, quantityApproved: null,
      trace: [{ stage: "PRICING", outcome: "PER_VISIT_CASE_RATE", detail: `payable ${rate}` }],
    });
    return results;
  }

  // ── Stage 8: AVERAGE_COST_POOL (spec §5.7 P5/P6, example 9) ──
  // Lines pay per billed; NO line shortfall; claim tagged to a reconciliation
  // pool. Recovery is computed at reconciliation, not per claim.
  private static applyAverageCostPool(ctx: EngineClaimContext, rule: { params: unknown }): { lines: EngineLineResult[]; poolTag: string } {
    const params = (rule.params ?? {}) as { poolId?: string };
    const poolTag = params.poolId ?? "AVG_COST_POOL";
    const lines = ctx.lines.map(l => ({
      lineId: l.id, decision: "AUTO_APPROVED" as const, matchedRuleType: "AVERAGE_COST_POOL", matchedRuleId: null,
      matchMethod: "AVERAGE_COST", payableSource: "Average-cost pool — settled at reconciliation", reasonCode: null,
      contractedAmount: round2(l.billedAmount), payableAmount: round2(l.billedAmount), shortfallAmount: 0,
      disallowedAmount: 0, memberLiability: 0, payerLiability: round2(l.billedAmount), providerWriteOff: 0,
      quantityApproved: null,
      trace: [{ stage: "PRICING", outcome: "AVERAGE_COST_POOL", detail: poolTag }],
    }));
    return { lines, poolTag };
  }

  // ── Stage 8: package assembly (spec §5.8, examples 4 & 5) ──
  // The first triggered package (when packageOverridesLineItems ∧ ¬unbundling)
  // zero-prices its included components (PRC-005), prices excluded components
  // separately, and adds a single package-price payable line.
  private static assemblePackages(
    lineResults: EngineLineResult[],
    ctx: EngineClaimContext,
    packages: Array<{ id: string; name: string; packagePrice: unknown; triggerType: string; triggerCodes: string[]; unbundlingAllowed: boolean; packageOverridesLineItems: boolean; components: Array<{ type: string; description: string; code: string | null }> }>,
    contract: ProviderContract,
  ): EngineLineResult[] {
    const inputById = new Map(ctx.lines.map(l => [l.id, l]));
    for (const pkg of packages) {
      if (pkg.unbundlingAllowed || !pkg.packageOverridesLineItems) continue;
      const triggered = ctx.lines.some(l => this.packageTriggered(l, pkg));
      if (!triggered) continue;

      const excluded = pkg.components.filter(c => c.type === "EXCLUDED");
      const isExcludedComp = (l: EngineLineInput) =>
        excluded.some(c => (c.code && l.cptCode && c.code === l.cptCode) || (c.description && normalize(l.description).includes(normalize(c.description))));

      let includedBilled = 0;
      for (const lr of lineResults) {
        const input = inputById.get(lr.lineId);
        if (!input) continue;
        if (isExcludedComp(input)) continue; // priced separately (complications, advanced imaging)
        includedBilled += input.billedAmount;
        lr.decision = "AUTO_APPROVED";
        lr.matchedRuleType = "PACKAGE";
        lr.matchMethod = "PACKAGE";
        lr.payableSource = `Included in package "${pkg.name}"`;
        lr.reasonCode = "PRC-005";
        lr.contractedAmount = 0;
        lr.payableAmount = 0;
        lr.payerLiability = 0;
        lr.shortfallAmount = 0;
        lr.disallowedAmount = 0;
        lr.providerWriteOff = 0;
        lr.memberLiability = 0;
        lr.trace.push({ stage: "PACKAGE", outcome: "PACKAGE_COMPONENT", reasonCode: "PRC-005", detail: pkg.name });
      }

      const price = round2(Number(pkg.packagePrice));
      const disallowed = round2(Math.max(0, includedBilled - price));
      lineResults.push({
        lineId: `package-${pkg.id}`, decision: "AUTO_APPROVED", matchedRuleType: "PACKAGE", matchedRuleId: pkg.id,
        matchMethod: "PACKAGE", payableSource: `Package "${pkg.name}"`, reasonCode: null,
        contractedAmount: price, payableAmount: price, shortfallAmount: 0, disallowedAmount: disallowed,
        memberLiability: this.memberPays(contract) ? disallowed : 0, payerLiability: price,
        providerWriteOff: this.memberPays(contract) ? 0 : disallowed, quantityApproved: null,
        trace: [{ stage: "PACKAGE", outcome: "PACKAGE_APPLIED", ruleRef: pkg.id, detail: `price ${price}, disallowed ${disallowed}` }],
      });
      break; // one package per episode
    }
    return lineResults;
  }

  private static packageTriggered(l: EngineLineInput, pkg: { triggerType: string; triggerCodes: string[] }): boolean {
    switch (pkg.triggerType) {
      case "PROCEDURE_CODE": return !!l.cptCode && pkg.triggerCodes.includes(l.cptCode);
      case "DIAGNOSIS_CODE": return !!l.icdCode && pkg.triggerCodes.includes(l.icdCode);
      case "SERVICE_DESCRIPTION": return pkg.triggerCodes.some(c => normalize(l.description).includes(normalize(c)));
      default: return false;
    }
  }
}
