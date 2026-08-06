/**
 * Diagnosis Gate — protocol pack lifecycle (C1.2).
 *
 * Clinical content reaches the engine through exactly one door (DG-D6):
 *
 *   import (validate → DRAFT) → submit (PENDING_APPROVAL) → approve (checker, maker≠checker)
 *     → activate (deliberate, supersedes the prior pack) → [the CLINICAL stage reads ACTIVE only]
 *
 * Approval and activation are deliberately SEPARATE acts. A checker approving the
 * content is a judgement about correctness; putting it in force is an operational
 * decision with a different blast radius, and the clinical owner should be able to
 * approve a version today and switch to it on Monday. Both actors are recorded.
 *
 * A pack is immutable once written — there is no "edit a rule" path anywhere in this
 * service. Fixing content means a new pack version from a new workbook, which keeps the
 * audit trail honest: every flag a claim ever received can be traced to the exact
 * content set in force at that moment.
 */
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApprovalRequestService } from "../approval-request.service";
import { type ProtocolPack, serialisePack, normaliseCode, normaliseAliasValue } from "./pack-types";
import { validatePack, type ValidationResult } from "./pack-validate";

type Db = PrismaClient | Prisma.TransactionClient;

export interface PackChangePayload {
  packId: string;
  version: number;
  sourceFileName: string;
  checksum: string;
  groups: number;
  memberships: number;
  labRules: number;
}

/** Safe approval payload — identity and size, never the clinical content itself. */
export function buildPackChangePayload(row: {
  id: string;
  version: number;
  sourceFileName: string;
  sourceChecksum: string;
  validationStats: unknown;
}): PackChangePayload {
  const stats = (row.validationStats ?? {}) as Record<string, number>;
  return {
    packId: row.id,
    version: row.version,
    sourceFileName: row.sourceFileName,
    checksum: row.sourceChecksum,
    groups: stats.groups ?? 0,
    memberships: stats.memberships ?? 0,
    labRules: stats.labRules ?? 0,
  };
}

export class ProtocolPackService {
  /**
   * Validate a pack and persist it as DRAFT. Nothing is active yet.
   *
   * ICD-10 memberships are existence-checked against the platform's own `ICD10Code`
   * table here — the converter cannot do that offline. ICD-11 has no reference table on
   * the platform, so the converter's check against the workbook's master sheet is the
   * authority for that system (the validator warns, rather than silently trusting).
   */
  static async createDraftFromImport(
    tenantId: string,
    pack: ProtocolPack,
    opts: { createdById: string; notes?: string },
  ): Promise<{ packId: string; version: number; validation: ValidationResult }> {
    const icd10Codes = pack.memberships.filter((m) => m.codeSystem === "ICD10").map((m) => normaliseCode(m.code));
    const known: Partial<Record<"ICD10" | "ICD11", Set<string>>> = {};
    if (icd10Codes.length > 0) {
      const found = await prisma.iCD10Code.findMany({ where: { code: { in: icd10Codes } }, select: { code: true } });
      known.ICD10 = new Set(found.map((f) => normaliseCode(f.code)));
    }

    const validation = validatePack(pack, { knownCodes: known });
    if (!validation.importable) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `This pack has ${validation.errors.length} blocking error(s) and cannot be imported. The first is: ${validation.errors[0]?.message ?? "unknown"}`,
      });
    }

    const serialised = serialisePack(pack);
    const checksum = createHash("sha256").update(serialised).digest("hex");

    // Re-importing content identical to what is already in force is a no-op, not a new
    // version — otherwise the version history fills with meaningless entries.
    const activeSame = await prisma.clinicalProtocolPack.findFirst({
      where: { tenantId, isActive: true, sourceChecksum: checksum },
      select: { id: true, version: true },
    });
    if (activeSame) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `This content is identical to the pack already in force (version ${activeSame.version}). Nothing to import.`,
      });
    }

    const latest = await prisma.clinicalProtocolPack.findFirst({
      where: { tenantId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = (latest?.version ?? 0) + 1;

    // Ids are generated here so every child row can be written with createMany in one
    // transaction — no per-row round trips, and the whole pack lands atomically.
    const packId = randomUUID();
    const groupIds = new Map(pack.groups.map((g) => [g.groupCode, randomUUID()]));
    const ruleIds = new Map(pack.labRules.map((r) => [r.testCode, randomUUID()]));

    await prisma.$transaction(async (tx) => {
      await tx.clinicalProtocolPack.create({
        data: {
          id: packId,
          tenantId,
          version,
          status: "DRAFT",
          isActive: false,
          sourceFileName: pack.meta.sourceFileName,
          sourceChecksum: checksum,
          notes: opts.notes ?? pack.meta.notes,
          validationStats: validation.stats as Prisma.InputJsonValue,
          createdById: opts.createdById,
        },
      });

      await tx.clinicalInterventionGroup.createMany({
        data: pack.groups.map((g) => ({
          id: groupIds.get(g.groupCode)!,
          packId,
          groupCode: g.groupCode,
          name: g.name,
          description: g.description,
          isCatchAll: g.isCatchAll,
          // DG-D8: a catch-all can never be live-eligible, enforced at write time so it
          // is true of the data itself, not merely of the UI that edits it.
          enabledForLive: false,
          enabledForShadow: true,
          confirmationLookbackHours: g.confirmationLookbackHours ?? null,
          sourceRow: g.sourceRow,
        })),
      });

      await tx.clinicalCodeMembership.createMany({
        data: pack.memberships.map((m) => ({
          packId,
          groupId: groupIds.get(m.groupCode)!,
          codeSystem: m.codeSystem,
          code: normaliseCode(m.code),
          provenance: m.provenance,
          note: m.note,
        })),
        skipDuplicates: true,
      });

      await tx.clinicalLabRule.createMany({
        data: pack.labRules.map((r) => ({
          id: ruleIds.get(r.testCode)!,
          packId,
          testCode: r.testCode,
          testName: r.testName,
          department: r.department,
          requiresDiagnosis: r.requiresDiagnosis,
          repeatWindowHours: r.repeatWindowHours ?? null,
          failureMessage: r.failureMessage,
          auditRule: r.auditRule,
          sourceRow: r.sourceRow,
        })),
      });

      await tx.clinicalLabRuleGroupLink.createMany({
        data: pack.links.map((l) => ({
          packId,
          labRuleId: ruleIds.get(l.testCode)!,
          groupId: groupIds.get(l.groupCode)!,
          linkType: l.linkType,
        })),
        skipDuplicates: true,
      });

      await tx.clinicalLineAlias.createMany({
        data: pack.aliases.map((a) => ({
          packId,
          labRuleId: ruleIds.get(a.testCode)!,
          matchType: a.matchType,
          value: normaliseAliasValue(a.value),
        })),
        skipDuplicates: true,
      });
    });

    return { packId, version, validation };
  }

  /** Open a governed approval. The pack is not in force when this returns. */
  static async submitForApproval(tenantId: string, packId: string, makerId: string): Promise<{ requestId: string }> {
    const pack = await prisma.clinicalProtocolPack.findFirst({ where: { id: packId, tenantId } });
    if (!pack) throw new TRPCError({ code: "NOT_FOUND", message: "Protocol pack not found." });
    if (pack.status !== "DRAFT" && pack.status !== "REJECTED") {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Only a DRAFT or REJECTED pack can be submitted (this one is ${pack.status}).` });
    }

    const request = await ApprovalRequestService.create(tenantId, {
      actionType: "CLINICAL_PROTOCOL_CHANGE",
      entityType: "ClinicalProtocolPack",
      entityId: packId,
      makerId,
      clientId: null,
      amount: null,
      currency: null,
      payload: buildPackChangePayload(pack) as unknown as Record<string, unknown>,
    });
    if (!request) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "No approval matrix rule is configured for CLINICAL_PROTOCOL_CHANGE — configure one in Settings → Approval matrix before submitting clinical content.",
      });
    }

    await prisma.clinicalProtocolPack.update({
      where: { id: packId },
      data: { status: "PENDING_APPROVAL", approvalRequestId: request.id, createdById: pack.createdById ?? makerId },
    });
    return { requestId: request.id };
  }

  /**
   * Mark an approved pack APPROVED. Called by the approval dispatch on a completed
   * chain. Does NOT put the pack in force — see `activate`. Idempotent.
   */
  static async applyApprovedPackChange(tenantId: string, packId: string, checkerId: string): Promise<void> {
    const pack = await prisma.clinicalProtocolPack.findFirst({ where: { id: packId, tenantId } });
    if (!pack) throw new TRPCError({ code: "NOT_FOUND", message: "Protocol pack not found." });
    // Defence in depth — the approval chain already enforces segregation of duties.
    if (pack.createdById && pack.createdById === checkerId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "The person who imported this clinical content cannot approve it." });
    }
    if (pack.status === "APPROVED" || pack.isActive) return; // replay-safe

    await prisma.clinicalProtocolPack.updateMany({
      where: { id: packId, tenantId, status: { not: "APPROVED" } },
      data: { status: "APPROVED", approvedById: checkerId, approvedAt: new Date() },
    });
  }

  /**
   * Put an APPROVED pack in force, superseding whatever was active. Idempotent, and
   * safe under concurrent calls: the activation update is conditional on the pack not
   * already being active, so a double-click cannot supersede twice.
   */
  static async activate(tenantId: string, packId: string, actorId: string): Promise<void> {
    const pack = await prisma.clinicalProtocolPack.findFirst({ where: { id: packId, tenantId } });
    if (!pack) throw new TRPCError({ code: "NOT_FOUND", message: "Protocol pack not found." });
    if (pack.isActive) return;
    if (pack.status !== "APPROVED") {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Only an APPROVED pack can be put in force (this one is ${pack.status}).` });
    }

    await prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.clinicalProtocolPack.updateMany({
        where: { tenantId, isActive: true, id: { not: packId } },
        data: { isActive: false, status: "SUPERSEDED", supersededAt: now },
      });
      await tx.clinicalProtocolPack.updateMany({
        where: { id: packId, tenantId, isActive: false },
        data: { isActive: true, activatedById: actorId, activatedAt: now },
      });
    });
  }

  /**
   * Withdraw the pack in force. This is the safety valve: with no active pack the
   * CLINICAL stage passes every claim untouched, so withdrawing is always safe and
   * never strands a claim.
   */
  static async deactivate(tenantId: string, packId: string, actorId: string, reason: string): Promise<void> {
    if (!reason?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "A reason is required to withdraw clinical content." });
    const res = await prisma.clinicalProtocolPack.updateMany({
      where: { id: packId, tenantId },
      data: { isActive: false, status: "DEACTIVATED", deactivatedById: actorId, deactivationReason: reason.trim() },
    });
    if (res.count === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Protocol pack not found." });
  }

  /** The pack the CLINICAL stage evaluates against. Null ⇒ the stage passes everything. */
  static async getActivePack(db: Db, tenantId: string) {
    return db.clinicalProtocolPack.findFirst({
      where: { tenantId, isActive: true },
      select: { id: true, version: true, sourceFileName: true, activatedAt: true },
    });
  }

  /** Per-group live/shadow switches (DG-D5) for the pack in force. */
  static async setGroupEnablement(
    tenantId: string,
    groupId: string,
    patch: { enabledForShadow?: boolean; enabledForLive?: boolean },
  ): Promise<void> {
    const group = await prisma.clinicalInterventionGroup.findUnique({
      where: { id: groupId },
      select: { id: true, isCatchAll: true, name: true, pack: { select: { tenantId: true } } },
    });
    if (!group || group.pack.tenantId !== tenantId) throw new TRPCError({ code: "NOT_FOUND", message: "Condition not found." });
    if (patch.enabledForLive && group.isCatchAll) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `"${group.name}" is a broad category rather than a single diagnosis, so it can never route claims automatically (DG-D8). Split it into specific conditions first.`,
      });
    }
    await prisma.clinicalInterventionGroup.update({ where: { id: groupId }, data: patch });
  }

  static async listPacks(tenantId: string) {
    return prisma.clinicalProtocolPack.findMany({
      where: { tenantId },
      orderBy: { version: "desc" },
      select: {
        id: true, version: true, status: true, isActive: true, sourceFileName: true, sourceChecksum: true,
        validationStats: true, notes: true, createdById: true, approvedById: true, approvedAt: true,
        activatedById: true, activatedAt: true, supersededAt: true, deactivationReason: true, createdAt: true,
        _count: { select: { groups: true, memberships: true, labRules: true, links: true, aliases: true } },
      },
    });
  }

  /** Full content of one pack — for the detail screen and for diffing. */
  static async loadPackContent(tenantId: string, packId: string) {
    const pack = await prisma.clinicalProtocolPack.findFirst({
      where: { id: packId, tenantId },
      include: {
        groups: { orderBy: { groupCode: "asc" }, include: { _count: { select: { memberships: true } } } },
        labRules: { orderBy: { testCode: "asc" } },
        links: true,
        aliases: true,
      },
    });
    if (!pack) throw new TRPCError({ code: "NOT_FOUND", message: "Protocol pack not found." });
    return pack;
  }

  /**
   * What changed between two versions. Clinical content is reviewed by people, and
   * "trust me, it's the same except X" is not reviewable — so the diff is computed,
   * not asserted.
   */
  static async diffPacks(tenantId: string, fromPackId: string, toPackId: string) {
    const [a, b] = await Promise.all([
      ProtocolPackService.loadPackContent(tenantId, fromPackId),
      ProtocolPackService.loadPackContent(tenantId, toPackId),
    ]);

    const groupKey = (g: { groupCode: string }) => g.groupCode;
    const aGroups = new Map(a.groups.map((g) => [groupKey(g), g]));
    const bGroups = new Map(b.groups.map((g) => [groupKey(g), g]));

    const aRules = new Map(a.labRules.map((r) => [r.testCode, r]));
    const bRules = new Map(b.labRules.map((r) => [r.testCode, r]));

    const [aMem, bMem] = await Promise.all([
      prisma.clinicalCodeMembership.findMany({ where: { packId: fromPackId }, select: { code: true, codeSystem: true, group: { select: { groupCode: true } } } }),
      prisma.clinicalCodeMembership.findMany({ where: { packId: toPackId }, select: { code: true, codeSystem: true, group: { select: { groupCode: true } } } }),
    ]);
    const memSet = (rows: typeof aMem) => new Set(rows.map((m) => `${m.group.groupCode}|${m.codeSystem}|${m.code}`));
    const aMemSet = memSet(aMem);
    const bMemSet = memSet(bMem);

    const changedRules: Array<{ testCode: string; field: string; from: string; to: string }> = [];
    for (const [code, br] of bRules) {
      const ar = aRules.get(code);
      if (!ar) continue;
      const compare: Array<[string, string, string]> = [
        ["requiresDiagnosis", String(ar.requiresDiagnosis), String(br.requiresDiagnosis)],
        ["repeatWindowHours", String(ar.repeatWindowHours ?? "—"), String(br.repeatWindowHours ?? "—")],
        ["failureMessage", ar.failureMessage, br.failureMessage],
      ];
      for (const [field, from, to] of compare) {
        if (from !== to) changedRules.push({ testCode: code, field, from, to });
      }
    }

    return {
      from: { id: a.id, version: a.version },
      to: { id: b.id, version: b.version },
      groups: {
        added: [...bGroups.keys()].filter((k) => !aGroups.has(k)),
        removed: [...aGroups.keys()].filter((k) => !bGroups.has(k)),
        renamed: [...bGroups.entries()]
          .filter(([k, g]) => aGroups.has(k) && aGroups.get(k)!.name !== g.name)
          .map(([k, g]) => ({ groupCode: k, from: aGroups.get(k)!.name, to: g.name })),
      },
      memberships: {
        added: [...bMemSet].filter((k) => !aMemSet.has(k)).length,
        removed: [...aMemSet].filter((k) => !bMemSet.has(k)).length,
      },
      labRules: {
        added: [...bRules.keys()].filter((k) => !aRules.has(k)),
        removed: [...aRules.keys()].filter((k) => !bRules.has(k)),
        changed: changedRules,
      },
    };
  }
}
