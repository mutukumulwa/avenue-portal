import { prisma } from "@/lib/prisma";
import { peekNextDocumentNumber } from "@/lib/document-number";
import { TRPCError } from "@trpc/server";
import { AcceptanceMethod, FundingMode, MemberRelationship } from "@prisma/client";
import { auditChainService } from "./audit-chain.service";
import { blacklistService } from "./blacklist.service";
import { resolveSchemeClientId } from "./clientResolve";
import { resolveMemberPrefix } from "./member-numbering.service";
import { niraService } from "./integrations/nira.service";
import { pdfService } from "./pdf.service";
import { coverageService } from "./coverage.service";
import { renderQuotationHtml } from "../templates/pdf/quotation.template";

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function leftPad(n: number, width: number) {
  return String(n).padStart(width, "0");
}

async function nextMemberNumber(tenantId: string, clientId?: string | null): Promise<string> {
  const prefix = await resolveMemberPrefix(tenantId, clientId);
  // B4-WIDE: seed from max+1 (not count()+1) so a purge/gap can't collide.
  return peekNextDocumentNumber(prefix, (yp) =>
    prisma.member
      .findFirst({ where: { tenantId, memberNumber: { startsWith: yp } }, orderBy: { memberNumber: "desc" }, select: { memberNumber: true } })
      .then((r) => r?.memberNumber ?? null),
  );
}

async function nextInvoiceNumber(tenantId: string): Promise<string> {
  return peekNextDocumentNumber("INV", (yp) =>
    prisma.invoice
      .findFirst({ where: { tenantId, invoiceNumber: { startsWith: yp } }, orderBy: { invoiceNumber: "desc" }, select: { invoiceNumber: true } })
      .then((r) => r?.invoiceNumber ?? null),
  );
}

// ─── BINDING SERVICE ──────────────────────────────────────────────────────────

export const bindingService = {

  // ── 1. Capture acceptance event ──────────────────────────────────────────

  async captureAcceptance(
    quotationId: string,
    tenantId: string,
    method: AcceptanceMethod,
    acceptedById: string,
    documentUrl?: string,
  ) {
    const quotation = await prisma.quotation.findUnique({ where: { id: quotationId, tenantId } });
    if (!quotation) throw new TRPCError({ code: "NOT_FOUND", message: "Quotation not found" });
    if (quotation.status !== "SENT") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Only SENT quotations can be accepted" });
    }

    const coolingOffDays = 14;
    const coverStart = quotation.requestedCoverStart ?? new Date();
    const coolingOffEnds = new Date(coverStart.getTime() + coolingOffDays * 24 * 60 * 60 * 1000);

    // SYS-1: atomically claim the SENT→ACCEPTED transition as the FIRST write, so
    // two concurrent accepts can't both record an acceptance (QuotationAcceptance
    // is unique per quotation) or double-fire the transition. The loser matches 0
    // rows → CONFLICT, and its acceptance insert never runs (same transaction).
    const acceptance = await prisma.$transaction(async (tx) => {
      const claimed = await tx.quotation.updateMany({
        where: { id: quotationId, tenantId, status: "SENT" },
        data: { status: "ACCEPTED" },
      });
      if (claimed.count !== 1) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This quotation was just actioned by another user — refresh to see its current status.",
        });
      }
      return tx.quotationAcceptance.create({
        data: {
          tenantId,
          quotationId,
          method,
          acceptedById,
          acceptedAt: new Date(),
          documentUrl,
          coolingOffEnds,
        },
      });
    });

    await auditChainService.append({
      actorId: acceptedById,
      action: "QUOTATION:ACCEPTED",
      module: "BINDING",
      entityType: "Quotation",
      entityId: quotationId,
      payload: { method, coolingOffEnds },
      tenantId,
      description: `Quotation ${quotation.quoteNumber} accepted via ${method}`,
    });

    return acceptance;
  },

  // ── 2. Pre-bind validation ────────────────────────────────────────────────

  async runPreBindValidation(quotationId: string, tenantId: string) {
    const quotation = await prisma.quotation.findUnique({
      where: { id: quotationId, tenantId },
      include: { lives: true, acceptance: true },
    });
    if (!quotation) throw new TRPCError({ code: "NOT_FOUND", message: "Quotation not found" });

    const failures: string[] = [];

    if (!quotation.acceptance) failures.push("Acceptance event not recorded");
    if (!quotation.packageId)  failures.push("Package not selected");

    // Re-check blacklist
    const nationalIds = quotation.lives.filter((l) => l.nationalId).map((l) => l.nationalId!);
    if (nationalIds.length > 0) {
      const blacklisted = await blacklistService.checkBulk(tenantId, nationalIds);
      if (blacklisted.length > 0) {
        failures.push(`${blacklisted.length} life(s) now on blacklist since assessment`);
      }
    }

    // NIRA re-check (stub — just annotates)
    for (const life of quotation.lives) {
      if (life.nationalId) {
        const result = await niraService.validate(life.nationalId);
        if (!result.valid) failures.push(`Identity (NIRA) failed for ${life.nationalId}`);
      }
    }

    return { passed: failures.length === 0, failures };
  },

  // ── 3. Create memberships ────────────────────────────────────────────────

  /**
   * Creates Member records from QuotationLife records.
   * Finds or creates the Group. Links underwriting decisions.
   * Returns members in PENDING_ACTIVATION (not yet active).
   */
  async createMemberships(
    quotationId: string,
    tenantId: string,
    makerId: string,
    opts?: { packageId?: string | null },
  ) {
    const quotation = await prisma.quotation.findUnique({
      where: { id: quotationId, tenantId },
      include: {
        lives: { include: { decision: true } },
        acceptance: true,
      },
    });
    if (!quotation) throw new TRPCError({ code: "NOT_FOUND", message: "Quotation not found" });
    if (quotation.status !== "ACCEPTED") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Quotation must be ACCEPTED before creating memberships" });
    }

    // ── PR-037 guards: fail with operator-readable messages, never a raw
    // Prisma error. Broker quick-quotes carry no package and no census —
    // both are hard prerequisites for real membership records.
    if (!quotation.packageId && opts?.packageId) {
      const pkg = await prisma.package.findFirst({ where: { id: opts.packageId, tenantId }, select: { id: true } });
      if (!pkg) throw new TRPCError({ code: "BAD_REQUEST", message: "Selected benefit package not found" });
      await prisma.quotation.update({ where: { id: quotationId }, data: { packageId: pkg.id } });
      quotation.packageId = pkg.id;
    }
    if (!quotation.packageId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "This quotation has no benefit package. Select the package to bind under in the Create Memberships step " +
          "(or assign one via the quotation's Build page) before creating memberships.",
      });
    }
    if (quotation.lives.length === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "This quotation has no member census. Memberships are created from captured lives, not the headline member " +
          "counts — add the lives on the quotation's Build page (census) before binding.",
      });
    }

    // ── Find or create the Group (atomic double-bind guard) ────
    // Binding is one-shot per quotation. New business: create the group, then
    // atomically claim the quotation's empty group slot (groupId null → this
    // group). A concurrent bind that already linked a group loses the claim
    // (count 0) → we drop the orphan group we just made and surface CONFLICT, so
    // exactly ONE membership set is ever created. groupId is one-way (binding
    // never nulls it), so it is a safe claim marker — there is no post-ACCEPTED
    // quotation status to guard on.
    let groupId = quotation.groupId;
    if (!groupId) {
      // Create a Group from quotation details
      const groupCount = await prisma.group.count({ where: { tenantId } });
      const groupNumber = `GRP-${new Date().getFullYear()}-${leftPad(groupCount + 1, 5)}`;
      const effectiveDate = quotation.requestedCoverStart ?? new Date();
      const renewalDate   = new Date(effectiveDate);
      renewalDate.setFullYear(renewalDate.getFullYear() + 1);

      const group = await prisma.group.create({
        data: {
          tenantId,
          clientId: await resolveSchemeClientId(tenantId),
          name: quotation.legalName ?? quotation.prospectName ?? groupNumber,
          industry: quotation.prospectIndustry ?? undefined,
          contactPersonName:  quotation.prospectContact ?? quotation.legalName ?? "—",
          contactPersonPhone: "",
          contactPersonEmail: quotation.billingContactEmail ?? quotation.prospectEmail ?? "",
          packageId:          quotation.packageId!,
          contributionRate:   quotation.ratePerMember ?? 0,
          effectiveDate,
          renewalDate,
          status:             "PENDING",
          brokerId:           quotation.brokerId ?? undefined,
          clientType:         quotation.clientType ?? "CORPORATE",
          fundingMode:        quotation.fundingMode,
          notes: `Created from quotation ${quotation.quoteNumber}`,
        },
      });

      const claimed = await prisma.quotation.updateMany({
        where: { id: quotationId, tenantId, groupId: null },
        data: { groupId: group.id },
      });
      if (claimed.count !== 1) {
        // Lost the race — another bind already linked a group. Drop our orphan.
        await prisma.group.delete({ where: { id: group.id } }).catch(() => undefined);
        throw new TRPCError({
          code: "CONFLICT",
          message: "Binding is already in progress for this quotation — refresh to see its memberships.",
        });
      }
      groupId = group.id;
    } else {
      // Renewal / re-bind: the quotation already carries a group. Guard against a
      // second membership set being created for the same quotation.
      const existing = await prisma.member.count({ where: { quotationId, tenantId } });
      if (existing > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Memberships have already been created for this quotation — refresh to see them.",
        });
      }
    }

    // ── Build a principalId map for dependants ────────────────
    // We create principals first, then dependants.
    const principalLives = quotation.lives.filter((l) => l.role === "PRINCIPAL");
    const dependantLives  = quotation.lives.filter((l) => l.role === "DEPENDANT");

    // Map QuotationLife.id → Member.id (for linking dependants)
    const lifeIdToMemberId = new Map<string, string>();
    const createdMembers: string[] = [];

    const coverStart = quotation.requestedCoverStart ?? new Date();
    const coverEnd   = new Date(coverStart);
    coverEnd.setFullYear(coverEnd.getFullYear() + 1);

    // Create principals
    for (const life of principalLives) {
      const memberNumber = await nextMemberNumber(tenantId);
      const member = await prisma.member.create({
        data: {
          tenantId,
          memberNumber,
          groupId,
          firstName:    life.firstName,
          lastName:     life.lastName,
          idNumber:     life.nationalId ?? undefined,
          dateOfBirth:  life.dateOfBirth,
          gender:       life.gender,
          relationship: MemberRelationship.PRINCIPAL,
          packageId:    quotation.packageId!,
          enrollmentDate: new Date(),
          coverStartDate:  coverStart,
          coverEndDate:    coverEnd,
          status:          "PENDING_ACTIVATION",
          underwritingDecisionId: life.decision?.id ?? undefined,
          bindingMakerId:  makerId,
          quotationId,
        },
      });
      lifeIdToMemberId.set(life.id, member.id);
      createdMembers.push(member.id);

      // Carry over exclusions from the underwriting decision
      if (life.decision && life.decision.excludedIcd10Codes.length > 0) {
        await Promise.all(
          life.decision.excludedIcd10Codes.map((code) =>
            prisma.membershipExclusion.create({
              data: {
                tenantId,
                memberId: member.id,
                icd10Code: code,
                sourceDecisionId: life.decision!.id,
                effectiveFrom: coverStart,
              },
            })
          )
        );
      }

      // Carry over waiting period applications
      if (life.decision?.waitingPeriodDays && life.decision.waitingPeriodCategories.length > 0) {
        const wpEnd = new Date(coverStart.getTime() + life.decision.waitingPeriodDays * 24 * 60 * 60 * 1000);
        await prisma.waitingPeriodApplication.create({
          data: {
            tenantId,
            memberId: member.id,
            benefitCategories: life.decision.waitingPeriodCategories,
            waitingPeriodDays: life.decision.waitingPeriodDays,
            startDate: coverStart,
            endDate:   wpEnd,
            sourceDecisionId: life.decision.id,
          },
        });
      }
    }

    // Create dependants, linking to their principal member
    for (const life of dependantLives) {
      const principalMemberId = life.principalLifeId
        ? lifeIdToMemberId.get(life.principalLifeId)
        : undefined;

      const rel: MemberRelationship =
        life.gender === "FEMALE" ? MemberRelationship.SPOUSE :
        MemberRelationship.CHILD;

      const memberNumber = await nextMemberNumber(tenantId);
      const member = await prisma.member.create({
        data: {
          tenantId,
          memberNumber,
          groupId,
          firstName:    life.firstName,
          lastName:     life.lastName,
          idNumber:     life.nationalId ?? undefined,
          dateOfBirth:  life.dateOfBirth,
          gender:       life.gender,
          relationship: rel,
          principalId:  principalMemberId,
          packageId:    quotation.packageId!,
          enrollmentDate: new Date(),
          coverStartDate:  coverStart,
          coverEndDate:    coverEnd,
          status:          "PENDING_ACTIVATION",
          underwritingDecisionId: life.decision?.id ?? undefined,
          bindingMakerId:  makerId,
          quotationId,
        },
      });
      lifeIdToMemberId.set(life.id, member.id);
      createdMembers.push(member.id);
    }

    // FG-C5: open a coverage period per new member from cover start, so claim
    // eligibility resolves by the service date. Idempotent per member.
    for (const newMemberId of createdMembers) {
      await coverageService.openPeriod(prisma, tenantId, newMemberId, coverStart, "BINDING");
    }

    await auditChainService.append({
      actorId: makerId,
      action: "BINDING:MEMBERSHIPS_CREATED",
      module: "BINDING",
      entityType: "Quotation",
      entityId: quotationId,
      payload: { memberCount: createdMembers.length, groupId },
      tenantId,
      description: `${createdMembers.length} member(s) created in PENDING_ACTIVATION from quotation ${quotation.quoteNumber}`,
    });

    return { createdMemberIds: createdMembers, groupId };
  },

  // ── 4. Approve binder (checker step) ─────────────────────────────────────

  async approveBinder(quotationId: string, tenantId: string, checkerId: string) {
    // Fetch the maker from the first created member
    const member = await prisma.member.findFirst({
      where: { quotationId, tenantId },
      select: { bindingMakerId: true },
    });
    if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "No members found for this quotation" });
    if (!member.bindingMakerId) throw new TRPCError({ code: "BAD_REQUEST", message: "Binding maker not recorded" });
    if (member.bindingMakerId === checkerId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Maker and checker must be different users" });
    }

    // Record checker on all members for this quotation
    await prisma.member.updateMany({
      where: { quotationId, tenantId },
      data: { bindingCheckerId: checkerId },
    });

    const quotation = await prisma.quotation.findUnique({ where: { id: quotationId }, select: { quoteNumber: true } });

    await auditChainService.append({
      actorId: checkerId,
      action: "BINDING:BINDER_APPROVED",
      module: "BINDING",
      entityType: "Quotation",
      entityId: quotationId,
      payload: { checkerId, makerId: member.bindingMakerId },
      tenantId,
      description: `Binder approved for quotation ${quotation?.quoteNumber}`,
    });
  },

  // ── 5. Post debit note ────────────────────────────────────────────────────

  async postDebitNote(quotationId: string, tenantId: string, financeOfficerId: string) {
    const quotation = await prisma.quotation.findUnique({
      where: { id: quotationId, tenantId },
      select: {
        quoteNumber: true, groupId: true, finalPremium: true, memberCount: true,
        dependentCount: true, ratePerMember: true, requestedCoverStart: true,
        fundingMode: true,
      },
    });
    if (!quotation) throw new TRPCError({ code: "NOT_FOUND", message: "Quotation not found" });
    if (!quotation.groupId) throw new TRPCError({ code: "BAD_REQUEST", message: "Group must be created before posting debit note" });

    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const dueDate = quotation.requestedCoverStart ?? new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const totalAmount = Number(quotation.finalPremium ?? 0);
    const ratePerMember = Number(quotation.ratePerMember ?? 0);

    if (quotation.fundingMode === FundingMode.SELF_FUNDED) {
      // For self-funded schemes, create a FundDepositRequest
      const selfFundedAccount = await prisma.selfFundedAccount.findUnique({
        where: { groupId: quotation.groupId },
      });
      if (selfFundedAccount) {
        await prisma.fundDepositRequest.upsert({
          where: { groupId: quotation.groupId },
          update: { requiredAmount: totalAmount, dueDate, status: "PENDING" },
          create: {
            tenantId,
            selfFundedAccId: selfFundedAccount.id,
            groupId: quotation.groupId,
            requiredAmount: totalAmount,
            minimumToActivate: totalAmount * 0.5,
            dueDate,
          },
        });
      }
    }

    // Always create the Invoice (for record-keeping even on self-funded)
    const invoiceNumber = await nextInvoiceNumber(tenantId);
    const totalLives = quotation.memberCount + quotation.dependentCount;
    const stampDuty    = 40 * totalLives;
    const trainingLevy = totalAmount * 0.002;
    const phcf         = totalAmount * 0.0025;

    const invoice = await prisma.invoice.create({
      data: {
        tenantId,
        invoiceNumber,
        groupId: quotation.groupId,
        period,
        memberCount:  totalLives,
        ratePerMember,
        totalAmount,
        paidAmount:   0,
        balance:      totalAmount,
        stampDuty,
        trainingLevy,
        phcf,
        taxTotal: stampDuty + trainingLevy + phcf,
        dueDate,
        status: "SENT",
        notes: `Initial debit note from quotation ${quotation.quoteNumber}`,
      },
    });

    await auditChainService.append({
      actorId: financeOfficerId,
      action: "BINDING:DEBIT_NOTE_POSTED",
      module: "BILLING",
      entityType: "Invoice",
      entityId: invoice.id,
      payload: { invoiceNumber, totalAmount, quotationId },
      tenantId,
      description: `Debit note ${invoiceNumber} posted for quotation ${quotation.quoteNumber}`,
    });

    return invoice;
  },

  // ── 6. Accrue new-business broker commission ──────────────────────────────

  async accrueCommission(groupId: string, tenantId: string) {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        producers: {
          include: { broker: true },
        },
      },
    });
    if (!group || !group.brokerId) return;

    const producer = group.producers[0];
    if (!producer) return;

    // firstYearCommissionPct lives directly on the Broker model
    const grossPct = Number(producer.broker.firstYearCommissionPct ?? 10) / 100;
    const memberCount = await prisma.member.count({ where: { groupId, tenantId } });
    const grossContribution = Number(group.contributionRate) * (memberCount || 1);
    const grossCommission = grossContribution * grossPct;

    const wht   = grossCommission * 0.10;
    const levy  = 0;
    const vat   = 0;
    const net   = grossCommission - wht;

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);

    await prisma.commissionLedgerEntry.create({
      data: {
        brokerId:          group.brokerId,
        groupId,
        state:             "PENDING_RECONCILIATION",
        stateAsOf:         now,
        grossCommission,
        withholdingTax:    wht,
        vatAmount:         vat,
        iraAgentLevy:      levy,
        netPayable:        net,
        earnedPeriodStart: now,
        earnedPeriodEnd:   periodEnd,
        notes: "New business commission — pending first contribution receipt",
      },
    });
  },

  // ── 7. Generate membership certificate PDF ────────────────────────────────

  async generateCertificate(memberId: string, tenantId: string): Promise<Buffer> {
    const member = await prisma.member.findUnique({
      where: { id: memberId, tenantId },
      include: {
        group:   { select: { name: true } },
        package: { select: { name: true } },
      },
    });
    if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, logoUrl: true } });

    // Reuse quotation template structure for certificate
    const html = renderQuotationHtml({
      quoteNumber: member.memberNumber,
      issuedDate: new Date().toLocaleDateString("en-UG"),
      validUntil: member.coverEndDate ? new Date(member.coverEndDate).toLocaleDateString("en-UG") : "—",
      tenantName: tenant?.name ?? "Medvex",
      tenantLogoUrl: tenant?.logoUrl ?? undefined,
      clientName: `${member.firstName} ${member.lastName}`,
      clientType: "INDIVIDUAL",
      packageName: member.package?.name ?? "—",
      requestedCoverStart: member.coverStartDate ? new Date(member.coverStartDate).toLocaleDateString("en-UG") : "—",
      lineItems: [],
      totalContribution: 0,
      memberCount: 1,
      dependentCount: 0,
      notes: `Membership certificate for ${member.group?.name ?? "—"}`,
    });

    return pdfService.renderToPdf(html, { format: "A4" });
  },

  // ── 8. Queries ────────────────────────────────────────────────────────────

  async getMembershipsForQuotation(quotationId: string, tenantId: string) {
    return prisma.member.findMany({
      where: { quotationId, tenantId },
      select: {
        id: true, memberNumber: true, firstName: true, lastName: true,
        relationship: true, status: true, coverStartDate: true,
        bindingMakerId: true, bindingCheckerId: true,
      },
      orderBy: [{ relationship: "asc" }, { lastName: "asc" }],
    });
  },

  async getBindingStatus(quotationId: string, tenantId: string) {
    const quotation = await prisma.quotation.findUnique({
      where: { id: quotationId, tenantId },
      include: { acceptance: true },
    });
    const members = await prisma.member.findMany({
      where: { quotationId, tenantId },
      select: { id: true, bindingMakerId: true, bindingCheckerId: true, status: true },
    });
    const validationResult = quotation ? await bindingService.runPreBindValidation(quotationId, tenantId) : null;

    return {
      quotation,
      acceptance: quotation?.acceptance ?? null,
      membersCreated: members.length,
      binderApproved: members.length > 0 && members.every((m) => !!m.bindingCheckerId),
      validation: validationResult,
    };
  },
};
