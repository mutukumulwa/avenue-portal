/**
 * F0.6 (Provider Network OS) — deterministic provider-graph factory.
 *
 * The seed ships NO provider contracts, branches, applicability, or provider
 * users (see docs/provider-network-os/TEST_DB_HARNESS.md), so provider-scope
 * tests cannot lean on it. This factory builds a coherent, self-cleaning graph
 * covering the §20 UAT dataset dimensions that the current schema supports:
 *
 *   - two tenants (Alpha, Beta) → true cross-tenant tests;
 *   - providers A + B in Alpha, provider C in Beta;
 *   - branches A1/A2/B1/C1 (rows only — user→branch assignment arrives in F1.2,
 *     so this factory deliberately does NOT assign users to branches yet);
 *   - a client/group/package/version/benefit per tenant, in different currencies
 *     (Alpha UGX, Beta KES);
 *   - members active + inactive;
 *   - provider users for every persona label, all on the coarse PROVIDER_USER
 *     role (granular permissions arrive in F1.1), plus one suspended user;
 *   - ProviderContracts ACTIVE / EXPIRED / future-APPROVED and INCLUDE + EXCLUDE
 *     ContractApplicability — the effective-dating F1.8/F1.10/F1.11 exercise.
 *
 * Every run is namespaced by a unique token so parallel/repeat setup never
 * collides, and `teardown()` deletes in FK-safe order. No shared mutable state.
 *
 * Test-only: direct model creates here are outside the runtime claim/PA creator
 * allowlist by design (docs/claims-autopilot/CLAIM_CREATOR_INVENTORY §2).
 */
import { randomUUID } from "crypto";
import type { PrismaClient } from "@prisma/client";

export type ProviderWorld = Awaited<ReturnType<typeof buildProviderWorld>>;

type Prisma = PrismaClient | any;

const DAY = 24 * 60 * 60 * 1000;

export interface BuildOptions {
  /** stable across a run; defaults to a fresh short uuid. */
  token?: string;
}

export async function buildProviderWorld(prisma: Prisma, opts: BuildOptions = {}) {
  const token = opts.token ?? randomUUID().slice(0, 8);
  const now = new Date();
  const past = (d: number) => new Date(now.getTime() - d * DAY);
  const future = (d: number) => new Date(now.getTime() + d * DAY);
  const pwHash = "$2a$10$abcdefghijklmnopqrstuv"; // not a login target; placeholder hash

  // ── tenants ──────────────────────────────────────────────────────────────
  const alpha = await prisma.tenant.create({ data: { name: `Alpha ${token}`, slug: `alpha-${token}` } });
  const beta = await prisma.tenant.create({ data: { name: `Beta ${token}`, slug: `beta-${token}` } });

  // ── clients (payers) — different currencies ──────────────────────────────
  const clientAlpha = await prisma.client.create({
    data: { operatorTenantId: alpha.id, type: "EMPLOYER_SELF_FUNDED", name: `Alpha Payer ${token}`, slug: `alpha-payer-${token}`, currency: "UGX", memberNumberPrefix: `ALP${token.slice(0, 3).toUpperCase()}` },
  });
  const clientBeta = await prisma.client.create({
    data: { operatorTenantId: beta.id, type: "INSURER", name: `Beta Payer ${token}`, slug: `beta-payer-${token}`, currency: "KES", memberNumberPrefix: `BET${token.slice(0, 3).toUpperCase()}` },
  });

  // ── packages + versions + one benefit each ───────────────────────────────
  async function mkPackage(tenantId: string, name: string) {
    const pkg = await prisma.package.create({
      data: { tenantId, name: `${name} ${token}`, annualLimit: 1_000_000, contributionAmount: 50_000, status: "ACTIVE" },
    });
    const version = await prisma.packageVersion.create({
      data: { packageId: pkg.id, versionNumber: 1, effectiveFrom: past(365) },
    });
    await prisma.benefitConfig.create({
      data: { packageVersionId: version.id, category: "OUTPATIENT", annualSubLimit: 500_000 },
    });
    await prisma.package.update({ where: { id: pkg.id }, data: { currentVersionId: version.id } });
    return { pkg, version };
  }
  const pkgAlpha = await mkPackage(alpha.id, "Alpha Essential");
  const pkgBeta = await mkPackage(beta.id, "Beta Essential");

  // ── groups (schemes) ──────────────────────────────────────────────────────
  async function mkGroup(tenantId: string, clientId: string, packageId: string, name: string) {
    return prisma.group.create({
      data: {
        tenantId, clientId, packageId, name: `${name} ${token}`,
        contactPersonName: "Ops Lead", contactPersonPhone: "+256700000000", contactPersonEmail: `ops.${token}@example.test`,
        contributionRate: 50_000, effectiveDate: past(365), renewalDate: future(30), status: "ACTIVE",
      },
    });
  }
  const groupAlpha = await mkGroup(alpha.id, clientAlpha.id, pkgAlpha.pkg.id, "Alpha Scheme");
  const groupAlpha2 = await mkGroup(alpha.id, clientAlpha.id, pkgAlpha.pkg.id, "Alpha Scheme Two");
  const groupBeta = await mkGroup(beta.id, clientBeta.id, pkgBeta.pkg.id, "Beta Scheme");

  // ── members ────────────────────────────────────────────────────────────────
  let memberSeq = 0;
  async function mkMember(tenantId: string, groupId: string, packageId: string, prefix: string, status: "ACTIVE" | "SUSPENDED" = "ACTIVE") {
    memberSeq += 1;
    return prisma.member.create({
      data: {
        tenantId, groupId, packageId,
        memberNumber: `${prefix}-${token}-${String(memberSeq).padStart(4, "0")}`,
        firstName: "Test", lastName: `Member${memberSeq}`, dateOfBirth: new Date("1990-01-01"), gender: "FEMALE",
        enrollmentDate: past(300), activationDate: past(299), coverStartDate: past(299), coverEndDate: future(60),
        status,
      },
    });
  }
  const memberAlpha = await mkMember(alpha.id, groupAlpha.id, pkgAlpha.pkg.id, "ALP");
  const memberAlpha2 = await mkMember(alpha.id, groupAlpha2.id, pkgAlpha.pkg.id, "ALP");
  const memberAlphaInactive = await mkMember(alpha.id, groupAlpha.id, pkgAlpha.pkg.id, "ALP", "SUSPENDED");
  const memberBeta = await mkMember(beta.id, groupBeta.id, pkgBeta.pkg.id, "BET");

  // ── providers + branches ────────────────────────────────────────────────
  async function mkProvider(tenantId: string, name: string) {
    return prisma.provider.create({ data: { tenantId, name: `${name} ${token}`, type: "HOSPITAL", contractStatus: "ACTIVE", servicesOffered: ["Outpatient", "Inpatient"] } });
  }
  const providerA = await mkProvider(alpha.id, "Provider A");
  const providerB = await mkProvider(alpha.id, "Provider B");
  const providerC = await mkProvider(beta.id, "Provider C");
  const mkBranch = (tenantId: string, providerId: string, name: string) =>
    prisma.providerBranch.create({ data: { tenantId, providerId, name: `${name} ${token}`, isActive: true } });
  const branchA1 = await mkBranch(alpha.id, providerA.id, "A1");
  const branchA2 = await mkBranch(alpha.id, providerA.id, "A2");
  const branchB1 = await mkBranch(alpha.id, providerB.id, "B1");
  const branchC1 = await mkBranch(beta.id, providerC.id, "C1");

  // ── provider users (persona labels; all coarse PROVIDER_USER role) ────────
  const personas = ["frontdesk", "clinician", "biller", "finance", "admin", "integration"] as const;
  const usersA: Record<string, { id: string; email: string }> = {};
  for (const p of personas) {
    const u = await prisma.user.create({
      data: {
        tenantId: alpha.id, providerId: providerA.id, role: "PROVIDER_USER",
        email: `${p}.${token}@provider-a.test`, passwordHash: pwHash, firstName: p, lastName: "A", isActive: true,
      },
    });
    usersA[p] = { id: u.id, email: u.email };
  }
  const userB = await prisma.user.create({
    data: { tenantId: alpha.id, providerId: providerB.id, role: "PROVIDER_USER", email: `biller.${token}@provider-b.test`, passwordHash: pwHash, firstName: "biller", lastName: "B", isActive: true },
  });
  const userC = await prisma.user.create({
    data: { tenantId: beta.id, providerId: providerC.id, role: "PROVIDER_USER", email: `biller.${token}@provider-c.test`, passwordHash: pwHash, firstName: "biller", lastName: "C", isActive: true },
  });
  const userASuspended = await prisma.user.create({
    data: { tenantId: alpha.id, providerId: providerA.id, role: "PROVIDER_USER", email: `suspended.${token}@provider-a.test`, passwordHash: pwHash, firstName: "suspended", lastName: "A", isActive: false },
  });

  // ── contracts + applicability (effective-dating + INCLUDE/EXCLUDE) ────────
  let contractSeq = 0;
  async function mkContract(tenantId: string, providerId: string, status: string, start: Date, end: Date) {
    contractSeq += 1;
    return prisma.providerContract.create({
      data: {
        tenantId, providerId, status: status as any,
        contractNumber: `PC-${token}-${String(contractSeq).padStart(3, "0")}`,
        title: `${status} contract ${token}`, startDate: start, endDate: end,
      },
    });
  }
  // Provider A: ACTIVE (now), EXPIRED (past), future-APPROVED
  const contractAActive = await mkContract(alpha.id, providerA.id, "ACTIVE", past(90), future(275));
  const contractAExpired = await mkContract(alpha.id, providerA.id, "EXPIRED", past(800), past(400));
  const contractAFuture = await mkContract(alpha.id, providerA.id, "APPROVED", future(30), future(400));
  // Provider B: ACTIVE
  const contractBActive = await mkContract(alpha.id, providerB.id, "ACTIVE", past(90), future(275));
  // Provider C (Beta): ACTIVE
  const contractCActive = await mkContract(beta.id, providerC.id, "ACTIVE", past(90), future(275));

  const mkApplic = (contractId: string, clientId: string, groupId: string | null, rule: "INCLUDE" | "EXCLUDE", effFrom: Date, effTo: Date | null) =>
    prisma.contractApplicability.create({
      data: { contractId, clientId, groupId, inclusionType: rule as any, effectiveFrom: effFrom, effectiveTo: effTo, isActive: true },
    });
  // A ACTIVE: INCLUDE whole Alpha client, EXCLUDE the second Alpha group
  await mkApplic(contractAActive.id, clientAlpha.id, null, "INCLUDE", past(90), null);
  await mkApplic(contractAActive.id, clientAlpha.id, groupAlpha2.id, "EXCLUDE", past(90), null);
  // A EXPIRED: INCLUDE but expired window
  await mkApplic(contractAExpired.id, clientAlpha.id, null, "INCLUDE", past(800), past(400));
  // A FUTURE: INCLUDE starting in the future
  await mkApplic(contractAFuture.id, clientAlpha.id, null, "INCLUDE", future(30), null);
  // B ACTIVE: INCLUDE only groupAlpha (group-level)
  await mkApplic(contractBActive.id, clientAlpha.id, groupAlpha.id, "INCLUDE", past(90), null);
  // C ACTIVE: INCLUDE Beta client
  await mkApplic(contractCActive.id, clientBeta.id, null, "INCLUDE", past(90), null);

  const tenantIds = [alpha.id, beta.id];

  // ── reusable claim/PA targets (F2+) ────────────────────────────────────────
  let targetSeq = 0;
  const createdClaimIds: string[] = [];
  const createdPreauthIds: string[] = [];
  const createdCaseIds: string[] = [];
  const providerCId = providerC.id;

  async function createClaim(opts: { providerId?: string; branchId?: string | null; memberId?: string; status?: string } = {}) {
    targetSeq += 1;
    const providerId = opts.providerId ?? providerA.id;
    const tId = providerId === providerCId ? beta.id : alpha.id;
    const memberId = opts.memberId ?? (tId === beta.id ? memberBeta.id : memberAlpha.id);
    const row = await prisma.claim.create({
      data: {
        tenantId: tId, claimNumber: `CLM-${token}-${targetSeq}`, memberId, providerId,
        providerBranchId: opts.branchId ?? null, serviceType: "OUTPATIENT", dateOfService: now,
        diagnoses: [], procedures: [], billedAmount: 1000, benefitCategory: "OUTPATIENT",
        ...(opts.status ? { status: opts.status as never } : {}),
      },
    });
    createdClaimIds.push(row.id);
    return row;
  }

  async function createPreauth(opts: { providerId?: string; memberId?: string } = {}) {
    targetSeq += 1;
    const providerId = opts.providerId ?? providerA.id;
    const tId = providerId === providerCId ? beta.id : alpha.id;
    const memberId = opts.memberId ?? (tId === beta.id ? memberBeta.id : memberAlpha.id);
    const row = await prisma.preAuthorization.create({
      data: {
        tenantId: tId, preauthNumber: `PA-${token}-${targetSeq}`, memberId, providerId,
        submittedBy: "PROVIDER", diagnoses: [], procedures: [], estimatedCost: 1000, benefitCategory: "OUTPATIENT",
      },
    });
    createdPreauthIds.push(row.id);
    return row;
  }

  // ── settlement / remittance fixtures (F6.2) ────────────────────────────────
  // Builds a FROZEN settled batch directly (no GL-posting settlement service — the
  // throwaway DB has no chart of accounts). Represents the stored facts F6.2 reads.
  const createdBatchIds: string[] = [];
  const createdVoucherIds: string[] = [];
  const createdJournalIds: string[] = [];
  const seededReasonTenants = new Set<string>();
  let batchSeq = 0; // unique sequence within (tenant, provider, cycle) per run

  async function upsertReasonCode(tenantId: string, code: string, providerDescription: string, extra?: { internalDescription?: string; category?: string; remedy?: string; resubmissionAllowed?: boolean; defaultSeverity?: "REJECT" | "SHORTFALL" | "PEND" | "INFO" }) {
    seededReasonTenants.add(tenantId);
    return prisma.adjudicationReasonCode.upsert({
      where: { tenantId_code: { tenantId, code } },
      update: {},
      create: {
        tenantId, code,
        category: extra?.category ?? "Pricing",
        internalDescription: extra?.internalDescription ?? `INTERNAL: ${code}`,
        providerDescription,
        memberDescription: "member text",
        remedy: extra?.remedy ?? null,
        resubmissionAllowed: extra?.resubmissionAllowed ?? false,
        defaultSeverity: extra?.defaultSeverity ?? "SHORTFALL",
      },
    });
  }

  interface RemLineSpec {
    description?: string;
    cptCode?: string | null;
    quantity?: number;
    billed: number;
    contractedAllowed?: number | null;
    disallowed?: number;
    memberShare?: number;
    writeoff?: number;
    approved: number; // Track A line payable
    payerLiability?: number; // Track B engine (defaults to approved)
    reasonCode?: { code: string; providerDescription: string; internalDescription?: string; category?: string; remedy?: string; resubmissionAllowed?: boolean; defaultSeverity?: "REJECT" | "SHORTFALL" | "PEND" | "INFO" };
  }
  interface RemClaimSpec {
    memberId?: string;
    branchId?: string | null;
    billed: number;
    approved: number; // claim payable (header)
    memberShare?: number;
    approvedBase?: number; // defaults to approved (UGX)
    billedBase?: number | null;
    declineReasonCode?: string | null;
    submissionType?: "ORIGINAL" | "CORRECTION" | "RESUBMISSION" | "RECONSIDERATION";
    chainRootClaimId?: string;
    supersedesClaimId?: string;
    lines: RemLineSpec[];
  }
  interface RemBatchSpec {
    providerId?: string;
    currency?: string;
    baseCurrency?: string;
    status?: "SETTLED" | "CHECKER_APPROVED" | "MAKER_SUBMITTED" | "PENDING";
    withVoucher?: boolean;
    /** Also post a (line-less) settlement journal entry and link it to the voucher. */
    withJournal?: boolean;
    notes?: string;
    /** Override the stored batch total (to force a header↔batch mismatch test). */
    overrideBatchTotal?: number;
    claims: RemClaimSpec[];
  }

  async function createSettlementBatch(spec: RemBatchSpec) {
    targetSeq += 1;
    const providerId = spec.providerId ?? providerA.id;
    const tId = providerId === providerCId ? beta.id : alpha.id;
    const currency = spec.currency ?? (tId === beta.id ? "KES" : "UGX");
    const baseCurrency = spec.baseCurrency ?? "UGX";
    const status = spec.status ?? "SETTLED";
    const isSettled = status === "SETTLED";
    const sumApproved = spec.claims.reduce((s, c) => s + c.approved, 0);
    const sumBase = spec.claims.reduce((s, c) => s + (c.approvedBase ?? c.approved), 0);

    const batch = await prisma.providerSettlementBatch.create({
      data: {
        tenantId: tId, providerId,
        cycleMonth: 7, cycleYear: 2026, sequence: ++batchSeq,
        status: status as never, currency, baseCurrency,
        totalAmount: spec.overrideBatchTotal ?? sumApproved,
        baseTotalAmount: isSettled ? sumBase : 0,
        claimCount: spec.claims.length,
        makerId: usersA.finance?.id ?? providerId,
        checkerId: isSettled ? (usersA.admin?.id ?? providerId) : null,
        settledAt: isSettled ? now : null,
        notes: spec.notes ?? null,
      },
    });
    createdBatchIds.push(batch.id);

    let voucher: { id: string; voucherNumber: string } | null = null;
    if (spec.withVoucher ?? isSettled) {
      const v = await prisma.paymentVoucher.create({
        data: {
          voucherNumber: `PV-${token}-${targetSeq}`,
          tenantId: tId, providerId,
          totalAmount: sumApproved, currency, baseCurrency, baseTotalAmount: sumBase,
          claimCount: spec.claims.length,
          status: "PROCESSED", processedAt: now, processedBy: usersA.finance?.id ?? providerId,
          settlementBatchId: batch.id,
        },
      });
      voucher = { id: v.id, voucherNumber: v.voucherNumber };
      createdVoucherIds.push(v.id);
      if (spec.withJournal) {
        const je = await prisma.journalEntry.create({
          data: { tenantId: tId, entryNumber: `JE-${token}-${targetSeq}`, entryDate: now, description: `Settlement ${batch.id}`, sourceType: "SETTLEMENT_PAID", sourceId: batch.id },
        });
        createdJournalIds.push(je.id);
        await prisma.paymentVoucher.update({ where: { id: v.id }, data: { journalEntryId: je.id } });
      }
    }

    const claimIds: string[] = [];
    for (const c of spec.claims) {
      targetSeq += 1;
      const memberId = c.memberId ?? (tId === beta.id ? memberBeta.id : memberAlpha.id);
      const claim = await prisma.claim.create({
        data: {
          tenantId: tId, claimNumber: `CLM-${token}-${String(targetSeq).padStart(4, "0")}`,
          memberId, providerId, providerBranchId: c.branchId ?? null,
          serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT", dateOfService: now,
          diagnoses: [], procedures: [],
          currency, baseCurrency,
          billedAmount: c.billed, approvedAmount: c.approved,
          paidAmount: isSettled ? c.approved : 0,
          memberLiability: c.memberShare ?? 0,
          approvedBaseAmount: c.approvedBase ?? c.approved,
          billedBaseAmount: c.billedBase ?? null,
          declineReasonCode: c.declineReasonCode ?? null,
          submissionType: (c.submissionType ?? "ORIGINAL") as never,
          chainRootClaimId: c.chainRootClaimId ?? null,
          supersedesClaimId: c.supersedesClaimId ?? null,
          status: (isSettled ? "PAID" : "APPROVED") as never,
          decidedAt: past(1),
          settlementBatchId: batch.id,
          paymentVoucherId: voucher?.id ?? null,
        },
      });
      claimIds.push(claim.id);
      createdClaimIds.push(claim.id);

      let lineNo = 0;
      for (const l of c.lines) {
        lineNo += 1;
        let reasonCodeId: string | null = null;
        if (l.reasonCode) {
          const rc = await upsertReasonCode(tId, l.reasonCode.code, l.reasonCode.providerDescription, l.reasonCode);
          reasonCodeId = rc.id;
        }
        await prisma.claimLine.create({
          data: {
            claimId: claim.id, lineNumber: lineNo,
            description: l.description ?? `Service ${lineNo}`, cptCode: l.cptCode ?? null,
            quantity: l.quantity ?? 1, unitCost: l.billed / (l.quantity ?? 1),
            billedAmount: l.billed, approvedAmount: l.approved,
            contractedAmount: l.contractedAllowed === undefined ? null : l.contractedAllowed,
            disallowedAmount: l.disallowed ?? 0,
            memberLiability: l.memberShare ?? 0,
            providerWriteOff: l.writeoff ?? 0,
            payerLiability: l.payerLiability ?? l.approved,
            reasonCodeId,
          },
        });
      }
    }

    return { batch, voucher, claimIds };
  }

  // F6.7 — a disbursement fact for a batch (relation-less pointers).
  async function createDisbursement(spec: {
    batchId: string;
    providerId?: string;
    voucherId?: string | null;
    status?: "PENDING" | "RELEASED" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "REVERSED";
    amount: number;
    currency?: string;
    method?: string;
    maskedDestination?: string;
    externalReference?: string;
    idempotencyKey?: string;
  }) {
    const providerId = spec.providerId ?? providerA.id;
    const tId = providerId === providerCId ? beta.id : alpha.id;
    return prisma.providerDisbursement.create({
      data: {
        tenantId: tId, providerId, settlementBatchId: spec.batchId, voucherId: spec.voucherId ?? null,
        status: (spec.status ?? "PENDING") as never,
        amount: spec.amount, currency: spec.currency ?? "UGX", baseAmount: spec.amount, baseCurrency: "UGX",
        method: spec.method ?? null, maskedDestination: spec.maskedDestination ?? null, externalReference: spec.externalReference ?? null,
        idempotencyKey: spec.idempotencyKey ?? null,
      },
    });
  }

  // ── F7.2 — contract-view detail (versions, rates, rules, branches) ─────────
  // Attaches provider-visible detail to an existing contract so the F7.2 read
  // service has effective rate lines + versions + PA/doc rules + exclusions + a
  // capitation summary to project (and, via `header`, sensitive fields to prove
  // the allow-list never leaks them). ProviderTariff does NOT cascade on contract
  // delete (optional contract FK → SetNull) and its provider FK is required, so
  // teardown deletes tariffs by provider; every other child cascades with the
  // contract.
  async function seedContractDetail(spec: {
    contractId: string;
    providerId?: string;
    header?: Record<string, unknown>;
    versions?: Array<{ versionNumber: number; status?: string; effectiveFrom: Date; effectiveTo?: Date | null; changeSummary?: string | null }>;
    branchIds?: string[];
    rates?: Array<Record<string, unknown> & { serviceName: string; agreedRate: number; effectiveFrom: Date }>;
    preauthRules?: Array<Record<string, unknown>>;
    docRules?: Array<Record<string, unknown> & { documentType: string }>;
    exclusions?: Array<Record<string, unknown> & { serviceName: string }>;
    pricingRules?: Array<{ ruleKind: string; params?: unknown; isActive?: boolean }>;
  }) {
    const providerId = spec.providerId ?? providerA.id;
    const tId = providerId === providerCId ? beta.id : alpha.id;

    if (spec.header) {
      await prisma.providerContract.update({ where: { id: spec.contractId }, data: spec.header as any });
    }
    for (const v of spec.versions ?? []) {
      await prisma.contractVersion.create({
        data: { tenantId: tId, contractId: spec.contractId, versionNumber: v.versionNumber, status: (v.status ?? "ACTIVE") as any, effectiveFrom: v.effectiveFrom, effectiveTo: v.effectiveTo ?? null, changeSummary: v.changeSummary ?? null },
      });
    }
    for (const b of spec.branchIds ?? []) {
      await prisma.contractBranch.create({ data: { contractId: spec.contractId, branchId: b } });
    }
    const tariffIds: string[] = [];
    for (const r of spec.rates ?? []) {
      const row = await prisma.providerTariff.create({ data: {
        providerId, contractId: spec.contractId, branchId: (r.branchId as string) ?? null, clientId: (r.clientId as string) ?? null,
        serviceName: r.serviceName, standardDescription: (r.standardDescription as string) ?? null, providerDescription: (r.providerDescription as string) ?? null,
        cptCode: (r.cptCode as string) ?? null, providerServiceCode: (r.providerServiceCode as string) ?? null, codingSystem: (r.codingSystem as any) ?? null,
        agreedRate: r.agreedRate, currency: (r.currency as string) ?? "UGX", rateType: (r.rateType as any) ?? "FIXED", tariffType: (r.tariffType as any) ?? "NEGOTIATED",
        discountPct: (r.discountPct as number) ?? null, markupPct: (r.markupPct as number) ?? null, maxPayableAmount: (r.maxPayableAmount as number) ?? null, minPayableAmount: (r.minPayableAmount as number) ?? null,
        unitOfMeasure: (r.unitOfMeasure as any) ?? "PER_ITEM", maxQuantityPerVisit: (r.maxQuantityPerVisit as number) ?? null, quantityLimit: (r.quantityLimit as number) ?? null,
        frequencyLimit: (r.frequencyLimit as number) ?? null, frequencyPeriod: (r.frequencyPeriod as any) ?? null,
        genderRestriction: (r.genderRestriction as string) ?? null, ageMin: (r.ageMin as number) ?? null, ageMax: (r.ageMax as number) ?? null,
        requiresPreauth: (r.requiresPreauth as boolean) ?? false, requiresReferral: (r.requiresReferral as boolean) ?? false,
        externalScheme: (r.externalScheme as string) ?? null, externalRebateAmount: (r.externalRebateAmount as number) ?? null,
        rateMissing: (r.rateMissing as boolean) ?? false, sourceRef: (r.sourceRef as any) ?? undefined, notes: (r.notes as string) ?? null,
        effectiveFrom: r.effectiveFrom, effectiveTo: (r.effectiveTo as Date | null) ?? null,
      } as any });
      tariffIds.push(row.id);
    }
    for (const p of spec.preauthRules ?? []) {
      await prisma.preauthRule.create({ data: {
        tenantId: tId, contractId: spec.contractId,
        triggerType: (p.triggerType as any) ?? "ALWAYS", thresholdAmount: (p.thresholdAmount as number) ?? null,
        admissionRequired: (p.admissionRequired as boolean) ?? false, emergencyExempt: (p.emergencyExempt as boolean) ?? false,
        retrospectiveAllowed: (p.retrospectiveAllowed as boolean) ?? false, retrospectiveWindowHours: (p.retrospectiveWindowHours as number) ?? null,
        approvalSlaHours: (p.approvalSlaHours as number) ?? null, validityDays: (p.validityDays as number) ?? null,
        requiredDocumentTypes: (p.requiredDocumentTypes as string[]) ?? [], consequenceIfMissing: (p.consequenceIfMissing as any) ?? "ROUTE_MANUAL",
        isActive: (p.isActive as boolean) ?? true,
      } as any });
    }
    for (const d of spec.docRules ?? []) {
      await prisma.documentationRule.create({ data: {
        tenantId: tId, contractId: spec.contractId,
        documentType: d.documentType as any, mandatory: (d.mandatory as boolean) ?? true,
        appliesWhen: (d.appliesWhen as any) ?? undefined, consequenceIfMissing: (d.consequenceIfMissing as any) ?? "ROUTE",
        isActive: (d.isActive as boolean) ?? true,
      } as any });
    }
    for (const e of spec.exclusions ?? []) {
      await prisma.providerContractExclusion.create({ data: {
        contractId: spec.contractId, cptCode: (e.cptCode as string) ?? null, serviceName: e.serviceName,
        reason: (e.reason as string) ?? null, level: (e.level as any) ?? "TARIFF_LINE",
        icdCodes: (e.icdCodes as string[]) ?? [], dateFrom: (e.dateFrom as Date) ?? null, dateTo: (e.dateTo as Date) ?? null,
      } as any });
    }
    for (const pr of spec.pricingRules ?? []) {
      await prisma.pricingRule.create({ data: {
        tenantId: tId, contractId: spec.contractId, ruleKind: pr.ruleKind as any,
        params: (pr.params as any) ?? {}, isActive: pr.isActive ?? true,
      } as any });
    }
    return { tariffIds };
  }

  async function teardown() {
    // FK-safe order: branch assignments → applicability → contracts → members →
    // groups → benefit → version → package → branches → users → providers →
    // clients → tenants.
    const providerIds = [providerA.id, providerB.id, providerC.id];
    const contractIds = [contractAActive.id, contractAExpired.id, contractAFuture.id, contractBActive.id, contractCActive.id];
    // PNOS F1.2: assignments reference tenant/provider/user/branch — clear first.
    await prisma.providerUserBranchAssignment.deleteMany({ where: { tenantId: { in: tenantIds } } });
    // Provider services audit against this world's users (AuditLog.userId FK) —
    // clear those rows before the users are deleted. Scoped to this world's users.
    const worldUserIds = [
      ...Object.values(usersA).map((u) => u.id),
      userB.id, userC.id, userASuspended.id,
    ];
    await prisma.auditLog.deleteMany({ where: { userId: { in: worldUserIds } } });
    // F2+ targets (+ documents referencing them or scoped to this world) — before members/providers.
    await prisma.document.deleteMany({ where: { OR: [{ claimId: { in: createdClaimIds } }, { preauthId: { in: createdPreauthIds } }, { caseId: { in: createdCaseIds } }, { tenantId: { in: tenantIds } }] } });
    // F5.7: claims may now be created through the canonical intake (a correction's child —
    // an UNTRACKED id, with lines + a processing run + an intake receipt), so tear claims down
    // by TENANT (these tenants are world-exclusive) and clear every claim-FK dependent first.
    const worldClaimIds = (await prisma.claim.findMany({ where: { tenantId: { in: tenantIds } }, select: { id: true } })).map((c: { id: string }) => c.id);
    await prisma.adjudicationLog.deleteMany({ where: { claimId: { in: worldClaimIds } } });
    await prisma.claimLine.deleteMany({ where: { claimId: { in: worldClaimIds } } });
    await prisma.claimProcessingRun.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.claimIntakeReceipt.deleteMany({ where: { tenantId: { in: tenantIds } } });
    // F5.11: reconsideration satellites (relation-less to Claim; own cluster events → lines → case).
    const reconIds = (await prisma.claimReconsideration.findMany({ where: { tenantId: { in: tenantIds } }, select: { id: true } })).map((r: { id: string }) => r.id);
    await prisma.claimReconsiderationEvent.deleteMany({ where: { reconsiderationId: { in: reconIds } } });
    await prisma.claimReconsiderationLine.deleteMany({ where: { reconsiderationId: { in: reconIds } } });
    await prisma.claimReconsideration.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.claim.deleteMany({ where: { tenantId: { in: tenantIds } } });
    // F6.2: settlement batches + vouchers (claims FK to both — deleted above) + any
    // tenant-scoped reason codes seeded for line-level remittance reasons.
    // F6.7: disbursements (relation-less pointers to batch/voucher — no FK, delete freely).
    await prisma.providerDisbursement.deleteMany({ where: { tenantId: { in: tenantIds } } });
    // F6.9: reconciliation runs + exceptions (relation-less).
    await prisma.settlementReconciliationException.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.settlementReconciliationRun.deleteMany({ where: { tenantId: { in: tenantIds } } });
    // F6.10: payment-query messages (FK → query) then queries.
    await prisma.providerPaymentQueryMessage.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.providerPaymentQuery.deleteMany({ where: { tenantId: { in: tenantIds } } });
    // F7.4: master-data change events (FK → request) then requests (relation-less to Provider/Tenant).
    await prisma.providerMasterDataChangeEvent.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.providerMasterDataChangeRequest.deleteMany({ where: { tenantId: { in: tenantIds } } });
    // F7.7: improvement plans (actions + updates cascade on plan delete).
    await prisma.providerImprovementPlan.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.providerSettlementBatch.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.paymentVoucher.deleteMany({ where: { tenantId: { in: tenantIds } } });
    if (createdJournalIds.length > 0) {
      await prisma.journalLine.deleteMany({ where: { journalEntryId: { in: createdJournalIds } } });
      await prisma.journalEntry.deleteMany({ where: { id: { in: createdJournalIds } } });
    }
    if (seededReasonTenants.size > 0) {
      await prisma.adjudicationReasonCode.deleteMany({ where: { tenantId: { in: [...seededReasonTenants] } } });
    }
    // F3.2 intake evidence + F4.1 info requests (relation-less, so no FK forces this — kept tidy anyway)
    await prisma.preAuthorizationEvent.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.preauthIntakeReceipt.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.preauthInfoRequest.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.notificationOutbox.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.preAuthorization.deleteMany({ where: { id: { in: createdPreauthIds } } });
    await prisma.clinicalCase.deleteMany({ where: { id: { in: createdCaseIds } } });
    // F7.2: tariff lines are provider-scoped and do NOT cascade on contract delete
    // (optional contract FK → SetNull would orphan them; the required provider FK
    // then blocks provider deletion). Delete them explicitly, before the contracts.
    // Every other contract child (versions, branches, PA/doc rules, exclusions,
    // pricing rules) cascades with the contract below.
    await prisma.providerTariff.deleteMany({ where: { providerId: { in: providerIds } } });
    await prisma.contractApplicability.deleteMany({ where: { contractId: { in: contractIds } } });
    await prisma.providerContract.deleteMany({ where: { id: { in: contractIds } } });
    await prisma.member.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.group.deleteMany({ where: { tenantId: { in: tenantIds } } });
    const versionIds = [pkgAlpha.version.id, pkgBeta.version.id];
    const pkgIds = [pkgAlpha.pkg.id, pkgBeta.pkg.id];
    await prisma.package.updateMany({ where: { id: { in: pkgIds } }, data: { currentVersionId: null } });
    await prisma.benefitConfig.deleteMany({ where: { packageVersionId: { in: versionIds } } });
    await prisma.packageVersion.deleteMany({ where: { id: { in: versionIds } } });
    await prisma.package.deleteMany({ where: { id: { in: pkgIds } } });
    await prisma.providerBranch.deleteMany({ where: { providerId: { in: providerIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.provider.deleteMany({ where: { id: { in: providerIds } } });
    await prisma.client.deleteMany({ where: { operatorTenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  }

  return {
    token,
    tenants: { alpha, beta },
    clients: { alpha: clientAlpha, beta: clientBeta },
    packages: { alpha: pkgAlpha, beta: pkgBeta },
    groups: { alpha: groupAlpha, alpha2: groupAlpha2, beta: groupBeta },
    members: { alpha: memberAlpha, alpha2: memberAlpha2, alphaInactive: memberAlphaInactive, beta: memberBeta },
    providers: { a: providerA, b: providerB, c: providerC },
    branches: { a1: branchA1, a2: branchA2, b1: branchB1, c1: branchC1 },
    users: { a: usersA, b: userB, c: userC, aSuspended: userASuspended },
    contracts: { aActive: contractAActive, aExpired: contractAExpired, aFuture: contractAFuture, bActive: contractBActive, cActive: contractCActive },
    createClaim,
    createPreauth,
    createSettlementBatch,
    createDisbursement,
    seedContractDetail,
    teardown,
  };
}
