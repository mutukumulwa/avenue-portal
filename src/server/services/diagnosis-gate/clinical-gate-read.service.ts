/**
 * Diagnosis Gate — shadow read model (C2.5).
 *
 * Reads what the CLINICAL stage recorded on `ClaimProcessingStage` and turns it into the
 * numbers that decide whether the gate is fit to go live (gate G-C4).
 *
 * WHY THIS IS A READ MODEL AND NOT A SEPARATE PIPELINE: the stage persists its findings
 * whether or not it acts on them, so the shadow dataset is produced by the same code
 * path that would enforce. There is no parallel "simulation" that can drift away from
 * production behaviour — what you measure is what will happen.
 *
 * The numbers that matter for the exit memo:
 *   • hit rate per rule — how often each rule fires;
 *   • would-route volume — what share of gated-condition claims the gate would divert.
 *     A rule that fires on a third of claims is not a control, it is a re-routing of the
 *     book to the same humans it was meant to free;
 *   • sampled false-positive rate — from clinician verdicts (C4.2);
 *   • recognition rate — the share of findings whose claims the pack could read at all.
 *
 * PRIVACY: this service returns claim numbers, codes and counts. It never returns member
 * identifiers, amounts, or any clinical free text.
 */
import type { PrismaClient, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auditChainService } from "../audit-chain.service";
import type { ClinicalStageResult, ClinicalRuleHit } from "../claim-autopilot/stage-clinical";

export type ClinicalRuleCode = "R2" | "R3" | "R4";
export const CLINICAL_RULES: ClinicalRuleCode[] = ["R2", "R3", "R4"];

export interface ShadowWindow {
  from: Date;
  to: Date;
}

export interface RuleSummary {
  rule: ClinicalRuleCode;
  /** Claims carrying at least one finding for this rule. */
  claims: number;
  /** Individual findings (a claim can carry several for one rule). */
  findings: number;
  verdicts: { truePositive: number; falsePositive: number; unsure: number; total: number };
  /** Sampled false-positive rate, or null when nothing has been reviewed yet. */
  sampledFalsePositiveRate: number | null;
}

export interface ShadowSummary {
  window: ShadowWindow;
  evaluated: number;
  inScope: number;
  outOfScope: number;
  ambiguous: number;
  dormant: number;
  /** Claims that would have been routed had the gate been live for their condition. */
  wouldRoute: number;
  /** wouldRoute ÷ inScope — the guard against re-routing the whole book. */
  wouldRouteRate: number | null;
  rules: RuleSummary[];
  byGroup: Array<{ groupCode: string; groupName: string; evaluated: number; flagged: number }>;
  topTests: Array<{ testCode: string; testName: string; findings: number }>;
}

/** A stage row projected into something the dashboard can render. */
interface StageRow {
  claimId: string;
  claimNumber: string;
  providerName: string | null;
  dateOfService: Date;
  recordedAt: Date;
  result: ClinicalStageResult;
}

const asResult = (value: Prisma.JsonValue | null): ClinicalStageResult => (value && typeof value === "object" && !Array.isArray(value) ? (value as ClinicalStageResult) : {});

async function loadStageRows(db: PrismaClient, tenantId: string, window: ShadowWindow, limit = 5000): Promise<StageRow[]> {
  const rows = await db.claimProcessingStage.findMany({
    where: {
      stage: "CLINICAL",
      updatedAt: { gte: window.from, lte: window.to },
      run: { claim: { tenantId } },
    },
    select: {
      result: true,
      updatedAt: true,
      run: { select: { claim: { select: { id: true, claimNumber: true, dateOfService: true, provider: { select: { name: true } } } } } },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  return rows
    .filter((r) => r.run?.claim)
    .map((r) => ({
      claimId: r.run!.claim!.id,
      claimNumber: r.run!.claim!.claimNumber,
      providerName: r.run!.claim!.provider?.name ?? null,
      dateOfService: r.run!.claim!.dateOfService,
      recordedAt: r.updatedAt,
      result: asResult(r.result),
    }));
}

export const ClinicalGateReadService = {
  /** Headline numbers for the shadow dashboard and the G-C4 exit memo. */
  async summarize(tenantId: string, window: ShadowWindow, db: PrismaClient = prisma): Promise<ShadowSummary> {
    const rows = await loadStageRows(db, tenantId, window);

    let inScope = 0;
    let outOfScope = 0;
    let ambiguous = 0;
    let dormant = 0;
    let wouldRoute = 0;

    const perRuleClaims = new Map<ClinicalRuleCode, Set<string>>(CLINICAL_RULES.map((r) => [r, new Set<string>()]));
    const perRuleFindings = new Map<ClinicalRuleCode, number>(CLINICAL_RULES.map((r) => [r, 0]));
    const groups = new Map<string, { groupCode: string; groupName: string; evaluated: number; flagged: number }>();
    const tests = new Map<string, { testCode: string; testName: string; findings: number }>();

    for (const row of rows) {
      const res = row.result;
      // A dormant evaluation (no pack, or the condition switched off) is not evidence
      // about the rules — counting it as "clean" would flatter every rate below.
      if (res.skipped) {
        dormant += 1;
        continue;
      }
      if (res.outOfScope) {
        outOfScope += 1;
        continue;
      }
      inScope += 1;
      if (res.ambiguous) ambiguous += 1;

      const key = res.groupCode ?? "—";
      const g = groups.get(key) ?? { groupCode: key, groupName: res.groupName ?? key, evaluated: 0, flagged: 0 };
      g.evaluated += 1;

      const hits = res.ruleHits ?? [];
      if (hits.length > 0) {
        g.flagged += 1;
        wouldRoute += 1;
        for (const h of hits) {
          perRuleClaims.get(h.rule)?.add(row.claimId);
          perRuleFindings.set(h.rule, (perRuleFindings.get(h.rule) ?? 0) + 1);
          if (h.testCode) {
            const t = tests.get(h.testCode) ?? { testCode: h.testCode, testName: h.testName ?? h.testCode, findings: 0 };
            t.findings += 1;
            tests.set(h.testCode, t);
          }
        }
      }
      groups.set(key, g);
    }

    // Clinician verdicts (C4.2) give the sampled false-positive rate — the number the
    // exit gate actually turns on.
    const verdictRows = await db.clinicalShadowVerdict.groupBy({
      by: ["ruleCode", "verdict"],
      where: { tenantId, createdAt: { gte: window.from, lte: window.to } },
      _count: { _all: true },
    });
    const verdictFor = (rule: string) => {
      const pick = (v: string) => verdictRows.find((r) => r.ruleCode === rule && r.verdict === v)?._count._all ?? 0;
      const truePositive = pick("TRUE_POSITIVE");
      const falsePositive = pick("FALSE_POSITIVE");
      const unsure = pick("UNSURE");
      const total = truePositive + falsePositive + unsure;
      return { truePositive, falsePositive, unsure, total };
    };

    return {
      window,
      evaluated: rows.length,
      inScope,
      outOfScope,
      ambiguous,
      dormant,
      wouldRoute,
      wouldRouteRate: inScope > 0 ? wouldRoute / inScope : null,
      rules: CLINICAL_RULES.map((rule) => {
        const verdicts = verdictFor(rule);
        const judged = verdicts.truePositive + verdicts.falsePositive;
        return {
          rule,
          claims: perRuleClaims.get(rule)?.size ?? 0,
          findings: perRuleFindings.get(rule) ?? 0,
          verdicts,
          sampledFalsePositiveRate: judged > 0 ? verdicts.falsePositive / judged : null,
        };
      }),
      byGroup: [...groups.values()].sort((a, b) => b.flagged - a.flagged || b.evaluated - a.evaluated),
      topTests: [...tests.values()].sort((a, b) => b.findings - a.findings).slice(0, 20),
    };
  },

  /**
   * Individual findings for review. Bounded pagination — never an unbounded dump, and
   * never any member identifier or amount.
   */
  async listHits(
    tenantId: string,
    input: { window: ShadowWindow; rule?: ClinicalRuleCode; groupCode?: string; page?: number; pageSize?: number },
    db: PrismaClient = prisma,
  ) {
    const pageSize = Math.min(Math.max(input.pageSize ?? 50, 1), 200);
    const page = Math.max(input.page ?? 1, 1);
    const rows = await loadStageRows(db, tenantId, input.window);

    const flat: Array<{
      claimId: string; claimNumber: string; providerName: string | null; dateOfService: Date; recordedAt: Date;
      groupCode: string | null; groupName: string | null; hit: ClinicalRuleHit;
    }> = [];
    for (const row of rows) {
      for (const hit of row.result.ruleHits ?? []) {
        if (input.rule && hit.rule !== input.rule) continue;
        if (input.groupCode && row.result.groupCode !== input.groupCode) continue;
        flat.push({
          claimId: row.claimId, claimNumber: row.claimNumber, providerName: row.providerName,
          dateOfService: row.dateOfService, recordedAt: row.recordedAt,
          groupCode: row.result.groupCode ?? null, groupName: row.result.groupName ?? null, hit,
        });
      }
    }

    const total = flat.length;
    const items = flat.slice((page - 1) * pageSize, page * pageSize);

    // Attach any verdict already recorded, so a reviewer is not asked twice.
    const claimIds = [...new Set(items.map((i) => i.claimId))];
    const verdicts = claimIds.length
      ? await db.clinicalShadowVerdict.findMany({ where: { tenantId, claimId: { in: claimIds } }, select: { claimId: true, ruleCode: true, verdict: true } })
      : [];
    const verdictKey = new Map(verdicts.map((v) => [`${v.claimId}|${v.ruleCode}`, v.verdict]));

    return {
      page, pageSize, total,
      items: items.map((i) => ({ ...i, verdict: verdictKey.get(`${i.claimId}|${i.hit.rule}`) ?? null })),
    };
  },

  /** Record a clinician's judgement on a finding. One verdict per reviewer per finding. */
  async recordVerdict(
    tenantId: string,
    input: { claimId: string; ruleCode: ClinicalRuleCode; routeCode: string; verdict: "TRUE_POSITIVE" | "FALSE_POSITIVE" | "UNSURE"; note?: string; reviewedById: string },
    db: PrismaClient = prisma,
  ) {
    return db.clinicalShadowVerdict.upsert({
      where: { claimId_ruleCode_reviewedById: { claimId: input.claimId, ruleCode: input.ruleCode, reviewedById: input.reviewedById } },
      create: { tenantId, claimId: input.claimId, ruleCode: input.ruleCode, routeCode: input.routeCode, verdict: input.verdict, note: input.note, reviewedById: input.reviewedById },
      update: { verdict: input.verdict, note: input.note },
    });
  },

  /** CSV of the findings. Audited, because it leaves the platform. */
  async exportCsv(
    tenantId: string,
    input: { window: ShadowWindow; rule?: ClinicalRuleCode; groupCode?: string },
    actor: { userId: string },
    db: PrismaClient = prisma,
  ): Promise<{ filename: string; csv: string; rowCount: number }> {
    const { items, total } = await this.listHits(tenantId, { ...input, page: 1, pageSize: 200 }, db);
    const cell = (v: string | number | null | undefined) => {
      const s = v == null ? "" : String(v);
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const line = (cells: Array<string | number | null | undefined>) => cells.map(cell).join(",");
    const body = [
      line([`Diagnosis gate findings — ${input.window.from.toISOString().slice(0, 10)} to ${input.window.to.toISOString().slice(0, 10)}`]),
      "",
      line(["Claim", "Service date", "Provider", "Condition", "Rule", "Finding", "Test", "Prior claims", "Verdict"]),
      ...items.map((i) =>
        line([
          i.claimNumber, i.dateOfService.toISOString().slice(0, 10), i.providerName, i.groupName,
          i.hit.rule, i.hit.routeCode, i.hit.testName ?? "", (i.hit.priorClaimNumbers ?? []).join(" "), i.verdict ?? "",
        ]),
      ),
    ];
    const csv = `﻿${body.join("\r\n")}\r\n`;

    await auditChainService.append({
      actorId: actor.userId,
      action: "CLINICAL_GATE:EXPORT",
      module: "CLAIM",
      entityType: "ClinicalProtocolPack",
      entityId: `${input.window.from.toISOString().slice(0, 10)}:${input.rule ?? "ALL"}`,
      tenantId,
      payload: { from: input.window.from.toISOString(), to: input.window.to.toISOString(), rule: input.rule ?? null, groupCode: input.groupCode ?? null, rowCount: items.length, matched: total },
      description: `Diagnosis gate findings export (${input.rule ?? "all rules"}): ${items.length} of ${total} findings.`,
    });

    return { filename: `diagnosis-gate-findings-${input.window.from.toISOString().slice(0, 10)}.csv`, csv, rowCount: items.length };
  },
};
