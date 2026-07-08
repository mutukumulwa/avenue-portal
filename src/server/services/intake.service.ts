import { prisma } from "@/lib/prisma";
import { TRPCError } from "@trpc/server";
import { FundingMode, ClientType, Gender, LifeRole, UWDecisionType } from "@prisma/client";
import ExcelJS from "exceljs";
import { auditChainService } from "./audit-chain.service";
import { blacklistService } from "./blacklist.service";
import { niraService } from "./integrations/nira.service";

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface QuotationLifeInput {
  role: LifeRole;
  principalLifeId?: string;
  firstName: string;
  lastName: string;
  nationalId?: string;
  dateOfBirth: Date;
  gender: Gender;
  medicalHistory?: Array<{ icd10Code: string; description: string; isCurrentCondition: boolean }>;
}

export interface CensusRowError {
  row: number;
  column: string;
  message: string;
}

export interface GateError {
  gate: string;
  message: string;
  affectedLives?: string[]; // nationalIds
}

// ─── ESCALATION THRESHOLDS (configurable seed values) ────────────────────────

const HIGH_ATTENTION_ICD10_PREFIXES = ["C", "Z49", "I21", "I22", "I25"]; // cancer, dialysis, acute cardiac
const ESCALATION_GROSS_KES = 5_000_000;
const ESCALATION_LOADING_MULTIPLIER = 2.0;
const ESCALATION_SCHEME_DISCOUNT_PCT = 0.10;
const ESCALATION_RATE_DEVIATION_PCT = 0.15; // eslint-disable-line @typescript-eslint/no-unused-vars

// ─── INTAKE SERVICE ──────────────────────────────────────────────────────────

export const intakeService = {
  // ── Quote creation ────────────────────────────────────────────────────────

  async createQuotation(tenantId: string, createdById: string, data: {
    clientType: ClientType;
    fundingMode?: FundingMode;
    brokerId?: string;
    groupId?: string;
    packageId?: string;
    legalName?: string;
    kraPinCorporate?: string;
    billingContactEmail?: string;
    headcount?: number;
    requestedCoverStart?: Date;
    prospectName?: string;
    prospectContact?: string;
    prospectEmail?: string;
    prospectIndustry?: string;
  }) {
    const count = await prisma.quotation.count({ where: { tenantId } });
    const quoteNumber = `QUO-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;

    const quotation = await prisma.quotation.create({
      data: {
        tenantId,
        quoteNumber,
        createdBy: createdById,
        status: "DRAFT",
        clientType: data.clientType,
        fundingMode: data.fundingMode ?? FundingMode.INSURED,
        brokerId: data.brokerId,
        groupId: data.groupId,
        packageId: data.packageId,
        legalName: data.legalName,
        kraPinCorporate: data.kraPinCorporate,
        billingContactEmail: data.billingContactEmail,
        headcount: data.headcount,
        requestedCoverStart: data.requestedCoverStart,
        prospectName: data.prospectName,
        prospectContact: data.prospectContact,
        prospectEmail: data.prospectEmail,
        prospectIndustry: data.prospectIndustry,
        memberCount: 0,
        dependentCount: 0,
      },
    });

    await auditChainService.append({
      actorId: createdById,
      action: "QUOTATION:CREATED",
      module: "QUOTATION",
      entityType: "Quotation",
      entityId: quotation.id,
      payload: { quoteNumber, clientType: data.clientType, tenantId },
      tenantId,
      description: `Quotation ${quoteNumber} created`,
    });

    return quotation;
  },

  // ── Lives management ──────────────────────────────────────────────────────

  async addLives(quotationId: string, tenantId: string, lives: QuotationLifeInput[]) {
    const quotation = await prisma.quotation.findUnique({ where: { id: quotationId, tenantId } });
    if (!quotation) throw new TRPCError({ code: "NOT_FOUND", message: "Quotation not found" });
    if (!["DRAFT"].includes(quotation.status)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot add lives to a quotation in this status" });
    }

    const created = await prisma.$transaction(
      lives.map((life) =>
        prisma.quotationLife.create({
          data: {
            tenantId,
            quotationId,
            role: life.role,
            principalLifeId: life.principalLifeId,
            firstName: life.firstName,
            lastName: life.lastName,
            nationalId: life.nationalId,
            dateOfBirth: life.dateOfBirth,
            gender: life.gender,
            medicalHistory: (life.medicalHistory ?? []) as never,
          },
        })
      )
    );

    // Update member / dependent counts
    const principals = lives.filter((l) => l.role === LifeRole.PRINCIPAL).length;
    const dependants = lives.filter((l) => l.role === LifeRole.DEPENDANT).length;
    await prisma.quotation.update({
      where: { id: quotationId },
      data: {
        memberCount: { increment: principals },
        dependentCount: { increment: dependants },
      },
    });

    return created;
  },

  // ── Census file parsing ───────────────────────────────────────────────────

  async parseCensusFile(fileUrl: string): Promise<{
    lives: QuotationLifeInput[];
    rowErrors: CensusRowError[];
  }> {
    // fileUrl is a MinIO or local path; fetch as buffer
    const response = await fetch(fileUrl);
    const buffer = await response.arrayBuffer();

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);

    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return { lives: [], rowErrors: [{ row: 0, column: "FILE", message: "Workbook has no worksheets" }] };
    }

    // Expected columns (1-indexed): FirstName, LastName, NationalID, DOB, Gender, Relationship, ICD10Codes
    const REQUIRED_COLUMNS = ["FirstName", "LastName", "DOB", "Gender", "Relationship"];
    const lives: QuotationLifeInput[] = [];
    const rowErrors: CensusRowError[] = [];

    // Read header row to determine column positions
    const headerRow = sheet.getRow(1);
    const colMap: Record<string, number> = {};
    headerRow.eachCell((cell, colNum) => {
      const header = String(cell.value ?? "").trim();
      colMap[header] = colNum;
    });

    const missing = REQUIRED_COLUMNS.filter((c) => !(c in colMap));
    if (missing.length > 0) {
      return {
        lives: [],
        rowErrors: [{ row: 1, column: "HEADER", message: `Missing required columns: ${missing.join(", ")}` }],
      };
    }

    const nationalIds = new Set<string>();

    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return; // skip header

      const get = (col: string) => {
        const idx = colMap[col];
        return idx ? String(row.getCell(idx).value ?? "").trim() : "";
      };

      const firstName = get("FirstName");
      const lastName = get("LastName");
      const nationalId = get("NationalID") || undefined;
      const dobRaw = get("DOB");
      const genderRaw = get("Gender").toUpperCase();
      const relationshipRaw = get("Relationship").toUpperCase();
      const icd10Raw = get("ICD10Codes");

      if (!firstName) { rowErrors.push({ row: rowNum, column: "FirstName", message: "Required" }); return; }
      if (!lastName)  { rowErrors.push({ row: rowNum, column: "LastName",  message: "Required" }); return; }
      if (!dobRaw)    { rowErrors.push({ row: rowNum, column: "DOB",       message: "Required" }); return; }
      if (!genderRaw) { rowErrors.push({ row: rowNum, column: "Gender",    message: "Required" }); return; }

      const dob = new Date(dobRaw);
      if (isNaN(dob.getTime())) {
        rowErrors.push({ row: rowNum, column: "DOB", message: `Invalid date: ${dobRaw}` });
        return;
      }

      const gender: Gender | null =
        genderRaw === "M" || genderRaw === "MALE"   ? Gender.MALE :
        genderRaw === "F" || genderRaw === "FEMALE" ? Gender.FEMALE : null;
      if (!gender) {
        rowErrors.push({ row: rowNum, column: "Gender", message: `Unrecognised gender: ${genderRaw}. Use M/F` });
        return;
      }

      const role: LifeRole =
        relationshipRaw === "PRINCIPAL" ? LifeRole.PRINCIPAL : LifeRole.DEPENDANT;

      if (nationalId) {
        if (nationalIds.has(nationalId)) {
          rowErrors.push({ row: rowNum, column: "NationalID", message: `Duplicate ID within census: ${nationalId}` });
          return;
        }
        nationalIds.add(nationalId);
      }

      const medicalHistory = icd10Raw
        ? icd10Raw.split(",").map((code) => ({
            icd10Code: code.trim(),
            description: "",
            isCurrentCondition: true,
          }))
        : [];

      lives.push({ role, firstName, lastName, nationalId, dateOfBirth: dob, gender, medicalHistory });
    });

    return { lives, rowErrors };
  },

  // ── Validation gates ──────────────────────────────────────────────────────

  async submitForValidation(quotationId: string, tenantId: string, submittedById: string): Promise<{
    passed: boolean;
    errors: GateError[];
    quotation?: Awaited<ReturnType<typeof prisma.quotation.findUnique>>;
  }> {
    const quotation = await prisma.quotation.findUnique({
      where: { id: quotationId, tenantId },
      include: { lives: true },
    });
    if (!quotation) throw new TRPCError({ code: "NOT_FOUND", message: "Quotation not found" });
    if (quotation.status !== "DRAFT") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Only DRAFT quotations can be submitted for validation" });
    }

    const errors: GateError[] = [];

    // Gate 1: Required fields
    if (!quotation.packageId) errors.push({ gate: "REQUIRED_FIELDS", message: "Package must be selected" });
    if (!quotation.requestedCoverStart) errors.push({ gate: "REQUIRED_FIELDS", message: "Requested cover start date is required" });
    if (quotation.clientType === "CORPORATE" && !quotation.legalName) {
      errors.push({ gate: "REQUIRED_FIELDS", message: "Legal name is required for corporate schemes" });
    }

    // Gate 2: Lives present
    if (quotation.lives.length === 0) {
      errors.push({ gate: "NO_LIVES", message: "At least one life must be added to the submission" });
    }

    // Gate 3: Principals have dependants linked correctly
    const principalIds = new Set(quotation.lives.filter((l) => l.role === "PRINCIPAL").map((l) => l.id));
    for (const life of quotation.lives.filter((l) => l.role === "DEPENDANT")) {
      if (!life.principalLifeId || !principalIds.has(life.principalLifeId)) {
        errors.push({ gate: "DEPENDANT_LINK", message: `Dependant ${life.firstName} ${life.lastName} is not linked to a principal` });
      }
    }

    // Gate 4: Cover start at least 7 days ahead
    if (quotation.requestedCoverStart) {
      const minStart = new Date();
      minStart.setDate(minStart.getDate() + 7);
      if (quotation.requestedCoverStart < minStart) {
        errors.push({ gate: "COVER_START_DATE", message: "Requested cover start must be at least 7 days in the future" });
      }
    }

    // Gate 5: NIRA identity validation (stub — notes non-validated IDs for operator follow-up)
    for (const life of quotation.lives) {
      if (life.nationalId) {
        const result = await niraService.validate(life.nationalId);
        if (!result.valid) {
          errors.push({ gate: "NIRA", message: `NIRA returned invalid for ${life.nationalId}`, affectedLives: [life.nationalId] });
        }
        if (result.source === "stub" && !life.iprsValidated) {
          // Flag for operator — not a blocking error since it's a stub
          await prisma.quotationLife.update({ where: { id: life.id }, data: { iprsValidated: false } });
        }
      }
    }

    // Gate 6: Blacklist check
    const nationalIds = quotation.lives.filter((l) => l.nationalId).map((l) => l.nationalId!);
    if (nationalIds.length > 0) {
      const blacklisted = await blacklistService.checkBulk(tenantId, nationalIds);
      if (blacklisted.length > 0) {
        errors.push({
          gate: "BLACKLIST",
          message: `${blacklisted.length} life(s) match the internal blacklist`,
          affectedLives: blacklisted.map((b) => b.nationalId),
        });
      }
    }

    if (errors.length > 0) {
      // Transition to PENDING_VALIDATION to record that gates were run
      await prisma.quotation.update({
        where: { id: quotationId },
        data: { status: "PENDING_VALIDATION" },
      });
      await auditChainService.append({
        actorId: submittedById,
        action: "QUOTATION:VALIDATION_FAILED",
        module: "QUOTATION",
        entityType: "Quotation",
        entityId: quotationId,
        payload: { errors },
        tenantId,
        description: `Quotation ${quotation.quoteNumber} failed ${errors.length} validation gate(s)`,
      });
      return { passed: false, errors };
    }

    // All gates passed — move to PENDING_ASSESSMENT and enqueue
    const updated = await prisma.quotation.update({
      where: { id: quotationId },
      data: { status: "PENDING_ASSESSMENT" },
    });

    await auditChainService.append({
      actorId: submittedById,
      action: "QUOTATION:SUBMITTED_FOR_ASSESSMENT",
      module: "QUOTATION",
      entityType: "Quotation",
      entityId: quotationId,
      payload: { liveCount: quotation.lives.length },
      tenantId,
      description: `Quotation ${quotation.quoteNumber} submitted for assessment with ${quotation.lives.length} lives`,
    });

    return { passed: true, errors: [], quotation: updated };
  },

  // ── Risk profile assembly ─────────────────────────────────────────────────

  async assembleRiskProfile(quotationId: string, tenantId: string) {
    const lives = await prisma.quotationLife.findMany({ where: { quotationId, tenantId } });
    if (lives.length === 0) return null;

    // Age distribution (as of today)
    const now = new Date();
    const ageBuckets: Record<string, number> = { "0-17": 0, "18-35": 0, "36-50": 0, "51-60": 0, "60+": 0 };
    const genderSplit: Record<string, number> = { MALE: 0, FEMALE: 0, OTHER: 0 };
    const icd10Map: Record<string, number> = {};

    for (const life of lives) {
      const age = Math.floor((now.getTime() - life.dateOfBirth.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      if (age < 18) ageBuckets["0-17"]++;
      else if (age < 36) ageBuckets["18-35"]++;
      else if (age < 51) ageBuckets["36-50"]++;
      else if (age < 61) ageBuckets["51-60"]++;
      else ageBuckets["60+"]++;

      genderSplit[life.gender] = (genderSplit[life.gender] ?? 0) + 1;

      const history = (life.medicalHistory as Array<{ icd10Code: string }> | null) ?? [];
      for (const entry of history) {
        const chapter = entry.icd10Code.slice(0, 3);
        icd10Map[chapter] = (icd10Map[chapter] ?? 0) + 1;
      }
    }

    const principals = lives.filter((l) => l.role === "PRINCIPAL").length;
    const dependants = lives.filter((l) => l.role === "DEPENDANT").length;
    const dependantRatio = principals > 0 ? Math.round((dependants / principals) * 10000) / 10000 : 0;

    // Blacklist match count
    const nationalIds = lives.filter((l) => l.nationalId).map((l) => l.nationalId!);
    const blacklisted = nationalIds.length > 0 ? await blacklistService.checkBulk(tenantId, nationalIds) : [];

    const profile = await prisma.quotationRiskProfile.upsert({
      where: { quotationId },
      update: {
        ageDistribution: ageBuckets as never,
        genderSplit: genderSplit as never,
        dependantRatio,
        icd10ChapterSummary: icd10Map as never,
        blacklistMatches: blacklisted.length,
        computedAt: new Date(),
      },
      create: {
        tenantId,
        quotationId,
        ageDistribution: ageBuckets as never,
        genderSplit: genderSplit as never,
        dependantRatio,
        icd10ChapterSummary: icd10Map as never,
        blacklistMatches: blacklisted.length,
      },
    });

    return profile;
  },

  // ── Per-life underwriting decisions ──────────────────────────────────────

  async recordDecision(tenantId: string, deciderId: string, data: {
    quotationId: string;
    quotationLifeId: string;
    decision: UWDecisionType;
    loadingMultiplier?: number;
    excludedIcd10Codes?: string[];
    waitingPeriodDays?: number;
    waitingPeriodCategories?: string[];
    reasonCode: string;
    narrative?: string;
  }) {
    // Validate loading multiplier is in a sane range
    if (data.decision === UWDecisionType.LOADED) {
      if (!data.loadingMultiplier || data.loadingMultiplier < 1.01 || data.loadingMultiplier > 5.0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Loading multiplier must be between 1.01 and 5.0" });
      }
    }

    const decision = await prisma.underwritingDecision.upsert({
      where: { quotationLifeId: data.quotationLifeId },
      update: {
        decision: data.decision,
        loadingMultiplier: data.loadingMultiplier ?? null,
        excludedIcd10Codes: data.excludedIcd10Codes ?? [],
        waitingPeriodDays: data.waitingPeriodDays,
        waitingPeriodCategories: data.waitingPeriodCategories ?? [],
        reasonCode: data.reasonCode,
        narrative: data.narrative,
        decidedById: deciderId,
      },
      create: {
        tenantId,
        quotationId: data.quotationId,
        quotationLifeId: data.quotationLifeId,
        decision: data.decision,
        loadingMultiplier: data.loadingMultiplier ?? null,
        excludedIcd10Codes: data.excludedIcd10Codes ?? [],
        waitingPeriodDays: data.waitingPeriodDays,
        waitingPeriodCategories: data.waitingPeriodCategories ?? [],
        reasonCode: data.reasonCode,
        narrative: data.narrative,
        decidedById: deciderId,
      },
    });

    await auditChainService.append({
      actorId: deciderId,
      action: "UNDERWRITING:DECISION_RECORDED",
      module: "UNDERWRITING",
      entityType: "UnderwritingDecision",
      entityId: decision.id,
      payload: { quotationId: data.quotationId, lifeId: data.quotationLifeId, decision: data.decision, reasonCode: data.reasonCode },
      tenantId,
      description: `Underwriting decision ${data.decision} recorded for life ${data.quotationLifeId}`,
    });

    return decision;
  },

  // ── Submit for pricing (post-assessment) ─────────────────────────────────

  async submitForPricing(quotationId: string, tenantId: string, assessorId: string, schemeParams?: {
    schemeDiscountPct?: number;
    projectedGrossKes?: number;
  }): Promise<{ status: "ASSESSED" | "ASSESSED_PENDING_SENIOR_APPROVAL"; escalationReasons: string[] }> {
    const quotation = await prisma.quotation.findUnique({
      where: { id: quotationId, tenantId },
      include: { decisions: true, lives: true },
    });
    if (!quotation) throw new TRPCError({ code: "NOT_FOUND", message: "Quotation not found" });
    if (quotation.status !== "PENDING_ASSESSMENT") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Quotation is not in PENDING_ASSESSMENT status" });
    }

    const escalationReasons: string[] = [];

    // Check all escalation thresholds
    const projectedGross = schemeParams?.projectedGrossKes ?? 0;
    if (projectedGross > ESCALATION_GROSS_KES) {
      escalationReasons.push(`Projected gross contribution UGX ${projectedGross.toLocaleString()} exceeds UGX ${ESCALATION_GROSS_KES.toLocaleString()} threshold`);
    }

    const maxMultiplier = quotation.decisions.reduce(
      (max: number, d: { loadingMultiplier: { toString(): string } | null }) => {
        const val = d.loadingMultiplier ? Number(d.loadingMultiplier) : 0;
        return val > max ? val : max;
      },
      0,
    );
    if (maxMultiplier > ESCALATION_LOADING_MULTIPLIER) {
      escalationReasons.push(`Loading multiplier ${maxMultiplier.toFixed(2)}× exceeds 2.0× threshold`);
    }

    const discountPct = schemeParams?.schemeDiscountPct ?? 0;
    if (discountPct > ESCALATION_SCHEME_DISCOUNT_PCT) {
      escalationReasons.push(`Scheme discount ${(discountPct * 100).toFixed(1)}% exceeds 10% threshold`);
    }

    // Check for high-attention conditions in lives
    for (const life of quotation.lives) {
      const history = (life.medicalHistory as Array<{ icd10Code: string }> | null) ?? [];
      for (const entry of history) {
        const isHighAttention = HIGH_ATTENTION_ICD10_PREFIXES.some((prefix) =>
          entry.icd10Code.startsWith(prefix)
        );
        if (isHighAttention) {
          escalationReasons.push(`Life ${life.firstName} ${life.lastName} has high-attention condition: ${entry.icd10Code}`);
          break;
        }
      }
    }

    const newStatus = escalationReasons.length > 0 ? "ASSESSED_PENDING_SENIOR_APPROVAL" : "ASSESSED";

    await prisma.quotation.update({
      where: { id: quotationId },
      data: { status: newStatus, assessorNotes: quotation.assessorNotes },
    });

    // Complete the work queue item
    if (newStatus === "ASSESSED") {
      await prisma.assessorWorkQueueItem.updateMany({
        where: { quotationId, tenantId },
        data: { completedAt: new Date() },
      });
    }

    await auditChainService.append({
      actorId: assessorId,
      action: "QUOTATION:SUBMITTED_FOR_PRICING",
      module: "UNDERWRITING",
      entityType: "Quotation",
      entityId: quotationId,
      payload: { newStatus, escalationReasons },
      tenantId,
      description: `Quotation submitted for pricing — status: ${newStatus}`,
    });

    return { status: newStatus, escalationReasons };
  },

  // ── Senior approval ───────────────────────────────────────────────────────

  async approveSeniorAssessment(quotationId: string, tenantId: string, seniorId: string, note: string) {
    const quotation = await prisma.quotation.findUnique({ where: { id: quotationId, tenantId } });
    if (!quotation) throw new TRPCError({ code: "NOT_FOUND", message: "Quotation not found" });
    if (quotation.status !== "ASSESSED_PENDING_SENIOR_APPROVAL") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Quotation is not pending senior approval" });
    }
    // Maker-checker: senior approver cannot be the original assessor
    if (quotation.assignedAssessorId === seniorId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Senior approver cannot be the same user as the assigned assessor" });
    }

    await prisma.quotation.update({
      where: { id: quotationId },
      data: { status: "ASSESSED", seniorApprovalNote: note },
    });

    await prisma.assessorWorkQueueItem.updateMany({
      where: { quotationId, tenantId },
      data: { completedAt: new Date() },
    });

    await auditChainService.append({
      actorId: seniorId,
      action: "UNDERWRITING:SENIOR_APPROVED",
      module: "UNDERWRITING",
      entityType: "Quotation",
      entityId: quotationId,
      payload: { note, assessorId: quotation.assignedAssessorId },
      tenantId,
      description: `Senior assessment approval granted for quotation ${quotation.quoteNumber}`,
    });
  },

  // ── Decline / withdraw / return ───────────────────────────────────────────

  async decline(quotationId: string, tenantId: string, actorId: string, reason: string) {
    const quotation = await prisma.quotation.findUnique({ where: { id: quotationId, tenantId } });
    if (!quotation) throw new TRPCError({ code: "NOT_FOUND", message: "Quotation not found" });

    await prisma.quotation.update({
      where: { id: quotationId },
      data: { status: "DECLINED_BY_UNDERWRITING", declineReason: reason },
    });

    await auditChainService.append({
      actorId,
      action: "QUOTATION:DECLINED_BY_UNDERWRITING",
      module: "UNDERWRITING",
      entityType: "Quotation",
      entityId: quotationId,
      payload: { reason },
      tenantId,
      description: `Quotation ${quotation.quoteNumber} declined by underwriting: ${reason}`,
    });
  },

  async withdraw(quotationId: string, tenantId: string, actorId: string) {
    await prisma.quotation.update({
      where: { id: quotationId, tenantId },
      data: { status: "WITHDRAWN_BY_SUBMITTER" },
    });
    await auditChainService.append({
      actorId,
      action: "QUOTATION:WITHDRAWN",
      module: "QUOTATION",
      entityType: "Quotation",
      entityId: quotationId,
      payload: {},
      tenantId,
      description: "Quotation withdrawn by submitter",
    });
  },

  async returnToSubmitter(quotationId: string, tenantId: string, assessorId: string, reason: string) {
    await prisma.quotation.update({
      where: { id: quotationId, tenantId },
      data: { status: "DRAFT", assessorNotes: reason },
    });
    await auditChainService.append({
      actorId: assessorId,
      action: "QUOTATION:RETURNED_TO_SUBMITTER",
      module: "QUOTATION",
      entityType: "Quotation",
      entityId: quotationId,
      payload: { reason },
      tenantId,
      description: `Quotation returned to submitter: ${reason}`,
    });
  },

  // ── Work queue allocation (called by scheduled job) ───────────────────────

  async allocateWorkQueue(tenantId: string) {
    // Find PENDING_ASSESSMENT quotations with no work queue item yet
    const unallocated = await prisma.quotation.findMany({
      where: {
        tenantId,
        status: "PENDING_ASSESSMENT",
        workQueueItem: null,
      },
      select: { id: true },
    });

    if (unallocated.length === 0) return { allocated: 0 };

    // Get active UNDERWRITER users for this tenant
    const assessors = await prisma.userRoleAssignment.findMany({
      where: {
        tenantId,
        isActive: true,
        status: "ACTIVE",
        role: { code: "UNDERWRITER" },
      },
      select: { userId: true },
    });

    if (assessors.length === 0) return { allocated: 0 };

    const slaHours = 48; // configurable; use 48h default
    const slaDeadlineAt = new Date(Date.now() + slaHours * 60 * 60 * 1000);

    let allocated = 0;
    for (let i = 0; i < unallocated.length; i++) {
      const { userId } = assessors[i % assessors.length]; // round-robin
      const quotationId = unallocated[i].id;

      await prisma.$transaction([
        prisma.quotation.update({
          where: { id: quotationId },
          data: { assignedAssessorId: userId, assessorSlaDeadlineAt: slaDeadlineAt },
        }),
        prisma.assessorWorkQueueItem.create({
          data: { tenantId, quotationId, assignedToId: userId, slaDeadlineAt },
        }),
      ]);
      allocated++;
    }

    return { allocated };
  },

  // ── Queries ───────────────────────────────────────────────────────────────

  async getWithDetail(quotationId: string, tenantId: string) {
    return prisma.quotation.findUnique({
      where: { id: quotationId, tenantId },
      include: {
        lives: { include: { decision: true } },
        riskProfile: true,
        workQueueItem: true,
        decisions: { include: { decidedBy: { select: { firstName: true, lastName: true } } } },
        assessor: { select: { id: true, firstName: true, lastName: true } },
        broker: { select: { id: true, name: true } },
      },
    });
  },

  async getWorkQueue(tenantId: string, assessorId: string, page = 1, pageSize = 20) {
    const where = {
      tenantId,
      assignedToId: assessorId,
      completedAt: null,
      quotation: { status: "PENDING_ASSESSMENT" as const },
    };
    const [items, total] = await Promise.all([
      prisma.assessorWorkQueueItem.findMany({
        where,
        orderBy: [{ slaBreached: "desc" }, { slaDeadlineAt: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          quotation: {
            select: {
              id: true, quoteNumber: true, clientType: true, headcount: true,
              legalName: true, prospectName: true, status: true, requestedCoverStart: true,
              memberCount: true, dependentCount: true,
            },
          },
        },
      }),
      prisma.assessorWorkQueueItem.count({ where }),
    ]);
    return { items, total, page, pageSize };
  },

  async list(tenantId: string, opts: {
    status?: string;
    assignedAssessorId?: string;
    page?: number;
    pageSize?: number;
  } = {}) {
    const { page = 1, pageSize = 50 } = opts;
    const where = {
      tenantId,
      ...(opts.status ? { status: opts.status as never } : {}),
      ...(opts.assignedAssessorId ? { assignedAssessorId: opts.assignedAssessorId } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.quotation.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          broker: { select: { id: true, name: true } },
          assessor: { select: { id: true, firstName: true, lastName: true } },
          workQueueItem: { select: { slaDeadlineAt: true, slaBreached: true } },
        },
      }),
      prisma.quotation.count({ where }),
    ]);
    return { items, total, page, pageSize };
  },
};
