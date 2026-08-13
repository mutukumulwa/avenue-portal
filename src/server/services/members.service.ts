import { prisma } from "@/lib/prisma";
import type { MemberStatus, MemberRelationship, Gender } from "@prisma/client";
import { FraudService } from "./fraud.service";
import { nextMemberNumber } from "./member-numbering.service";
import { DomainEventService } from "@/server/services/domain-event.service";
import { coverageService } from "./coverage.service";
import { assertEnrolmentAge } from "./eligibility/enrolment-age";
import { GroupsService } from "./groups.service";
import {
  memberIdentityKeys,
  normalizeNationalId,
  normalizeSearchName,
} from "@/lib/normalize";
import {
  DuplicateIdentityError,
  blockingMatch,
  blockingMessage,
  candidateWarnings,
  findIdentityMatches,
} from "@/server/services/identity-match.service";
import { canEditTransition } from "@/lib/member-status";
import { canPerformMemberAction } from "@/lib/member-action-policy";
import type { Prisma } from "@prisma/client";
import {
  applyWithPrecondition,
  type ExpectedState,
  type PreconditionOutcome,
} from "@/lib/concurrency";
import { calendarDateToUtcDate } from "@/lib/calendar-date";
import { resolveMemberEnrolmentDates } from "@/lib/member-enrolment";
import {
  MEMBER_ADDRESS_FIELDS,
  validateMemberAddress,
  type MemberAddressInput,
} from "@/lib/member-address";
import {
  validateMemberDemographicEdits,
  validateMemberDemographics,
} from "@/lib/member-demographics";

/** Relationships an enrolment path may assign (SIBLING added in WP-3.5F). */
export type EnrolmentRelationship = "PRINCIPAL" | "SPOUSE" | "CHILD" | "PARENT" | "SIBLING";

/**
 * UAT-HF P07.02 — raised when a lifecycle command is applied to a member who has
 * moved since the operator's view loaded.
 *
 * Typed rather than a bare Error so the action layer can answer with a CONFLICT
 * the operator can act on, instead of the generic failure a thrown string
 * produces.
 */
export class StaleMemberTransitionError extends Error {
  constructor(public readonly expectedStatus: string) {
    super(
      `This member is no longer ${expectedStatus.replace(/_/g, " ").toLowerCase()}. Reload and check the current status before acting.`,
    );
    this.name = "StaleMemberTransitionError";
  }
}

export class MembersService {
  /**
   * Retrieves all members for a given tenant
   */
  static async getMembers(tenantId: string, clientId?: string | null) {
    return prisma.member.findMany({
      // Client isolation (G2.1 / G5.2): confined users see only their client's members.
      where: { tenantId, ...(clientId ? { group: { clientId } } : {}) },
      include: {
        group: true,
        package: true,
        principal: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Retrieves a specific member
   */
  static async getMemberById(tenantId: string, memberId: string) {
    return prisma.member.findUnique({
      where: { id: memberId, tenantId },
      include: {
        group: true,
        package: {
          include: {
            currentVersion: {
              include: { benefits: true },
            },
          },
        },
        dependents: true,
      },
    });
  }

  /**
   * Registers a new member into a group
   */
  static async createMember(tenantId: string, data: {
    groupId: string;
    firstName: string;
    lastName: string;
    idNumber?: string;
    dateOfBirth: string | Date;
    gender: "MALE" | "FEMALE" | "OTHER";
    phone?: string;
    email?: string;
    relationship?: EnrolmentRelationship;
    principalId?: string;
    /**
     * WP-3.5E: operator-supplied enrolment effective date. Drives enrollmentDate,
     * coverStartDate and the opening MemberCoveragePeriod so point-in-time
     * eligibility resolves by the real cover start, not "now". Defaults to today.
     */
    effectiveDate?: string | Date;
    /**
     * WP-3.5F newborn (CT-033): when the birth is notified within 30 days, the
     * newborn is covered from the DATE OF BIRTH (effectiveDate is pulled back to
     * the DOB) and may enrol without a national ID. Stored on the member.
     */
    birthNotificationDate?: string | Date;
    /** UAT-HF P05.06: structured Uganda address and optional consented coordinates. */
    addressCountry?: string;
    addressDistrict?: string;
    addressLocality?: string;
    addressSubcounty?: string;
    addressParish?: string;
    addressVillage?: string;
    addressLine?: string;
    addressLatitude?: string | number;
    addressLongitude?: string | number;
    addressCoordinateConsent?: string | boolean;
    /**
     * WP-3.5E/F: the reason stamped on the opening MemberCoveragePeriod. The HR /
     * endorsement channel passes "ENDORSEMENT"; defaults to "ENROLMENT" (manual +
     * import).
     */
    coveragePeriodReason?: string;
  }) {
    const demographics = validateMemberDemographics({
      firstName: data.firstName,
      lastName: data.lastName,
      gender: data.gender,
      relationship: data.relationship || "PRINCIPAL",
      phone: data.phone,
      email: data.email,
    });
    if (!demographics.ok) {
      throw new Error(Object.values(demographics.fieldErrors).flat().join(" "));
    }
    const relationship = demographics.value.relationship;
    const dateResult = resolveMemberEnrolmentDates({
      dateOfBirth:
        data.dateOfBirth instanceof Date ? data.dateOfBirth.toISOString().slice(0, 10) : data.dateOfBirth,
      effectiveDate:
        data.effectiveDate instanceof Date
          ? data.effectiveDate.toISOString().slice(0, 10)
          : data.effectiveDate,
      birthNotificationDate:
        data.birthNotificationDate instanceof Date
          ? data.birthNotificationDate.toISOString().slice(0, 10)
          : data.birthNotificationDate,
      relationship,
    });
    if (!dateResult.ok) {
      throw new Error(Object.values(dateResult.fieldErrors).flat().join(" "));
    }
    const dateOfBirth = calendarDateToUtcDate(dateResult.value.dateOfBirth)!;
    const effectiveDate = calendarDateToUtcDate(dateResult.value.coverStartDate)!;
    const birthNotificationDate = dateResult.value.birthNotificationDate
      ? calendarDateToUtcDate(dateResult.value.birthNotificationDate)
      : null;

    const phoneKey = demographics.value.phone;

    const addressResult = validateMemberAddress(data as MemberAddressInput);
    if (!addressResult.ok) {
      throw new Error(Object.values(addressResult.fieldErrors).flat().join(" "));
    }
    const address = addressResult.value;
    const addressCoordinateConsentAt = address.hasCoordinateConsent ? new Date() : null;

    /**
     * UAT-HF P05.03 — the whole enrolment is ONE transaction.
     *
     * It was a sequence of independent writes: allocate a number, create the
     * member row, open a coverage period. A failure after the member committed
     * left a member with NO coverage period — invisible to the point-in-time
     * eligibility engine — with nothing on the outside to say so. The
     * acceptance is explicit: "forced failure after member insert rolls
     * everything back".
     *
     * Every read and write below uses `tx`, including the member-number
     * allocation (P05.02) and the coverage period, so a rolled-back enrolment
     * leaves nothing behind — not a member, not a period, not a consumed
     * number... except the number, which is a sequence and does not go
     * backwards. That gap is documented in P05.02.
     */
    return prisma.$transaction(async (tx) => {

      const group = await tx.group.findUnique({
        where: { id: data.groupId, tenantId },
      });

      if (!group) throw new Error("Group not found");

      // NW-D02: when a dependant is linked to a principal, validate the principal
      // and enrol the dependant into the principal's own scheme (a dependant must
      // never land in a different group than the family they belong to).
      // ── UAT-HF P05.03 / P07.06 — DEF-031 (S2) ────────────────────────────
      // "Selecting Relationship 'Child' (or Spouse/Parent/Sibling) presents no
      // principal selector at all ... Submitting creates a live ACTIVE
      // dependant with no principal, no family unit and its own full Annual
      // Limit of UGX 25,000,000, with no warning at any point. Three such
      // orphaned CHILD members were created during this run."
      //
      // A dependant without a principal is not a member of anything: it has no
      // family unit to draw a shared limit against, so it silently got a
      // principal's entire limit. The relationship is refused rather than a
      // principal being guessed — the correct route (a principal's "Add
      // Dependent") already exists and carries the link.
      if (relationship !== "PRINCIPAL" && !data.principalId) {
        throw new Error(
          `A ${relationship.toLowerCase()} must be linked to a principal member. ` +
            `Open the principal's profile and use "Add Dependent" so the dependant joins their family unit and shares their limits.`,
        );
      }

      let effectiveGroup = group;
      if (data.principalId) {
        const principal = await tx.member.findFirst({
          where: { id: data.principalId, tenantId },
          select: { id: true, relationship: true, groupId: true, group: true, status: true },
        });
        if (!principal) throw new Error("Principal member not found for this dependant.");
        // M-013: a dependant cannot own dependants — the link target must itself be a
        // PRINCIPAL (a dependant linked to a dependant is rejected here).
        if (principal.relationship !== "PRINCIPAL") {
          throw new Error("Dependants can only be linked to a PRINCIPAL member.");
        }
        if (data.relationship === "PRINCIPAL") {
          throw new Error("A member linked to a principal cannot itself be a PRINCIPAL.");
        }
        // M-014: a dependant must join the principal's OWN scheme. Previously the
        // caller's groupId was silently overwritten with the principal's; now a
        // genuine cross-scheme link attempt is rejected explicitly server-side.
        if (data.groupId && data.groupId !== principal.groupId) {
          throw new Error(
            "A dependant must be enrolled in the same scheme as its principal — cross-scheme dependant links are not allowed.",
          );
        }
        // UAT-HF P07.06 — DEF-058. The run clicked Add Dependent on a LAPSED
        // principal and got the enrolment form with "no warning that the
        // principal is lapsed, no block, no override step". The acceptance is
        // that a lapsed member "cannot invoke protected action through UI **or
        // forged request**", so the refusal lives here, not only in the button.
        //
        // Checked AFTER the M-013/M-014 identity guards so those keep their own
        // specific messages: "you linked to a dependant" is more useful than
        // "that member is lapsed" when both are true.
        const verdict = canPerformMemberAction(principal.status, "ADD_DEPENDANT");
        if (!verdict.allowed) {
          throw new Error(`${verdict.reason} ${verdict.nextAction}`);
        }

        // Inherit the principal's scheme.
        effectiveGroup = principal.group;
        data.groupId = principal.groupId;
      }

      // ── WP-3.5D: age gate at enrolment ────────────────────────────────────────
      // Reject an over-age principal / dependant (and future/impossible DOB) against
      // the scheme package's caps, as of the effective date. Exactly-max is eligible.
      const ageRules = await tx.package.findUnique({
        where: { id: effectiveGroup.packageId, tenantId },
        select: { maxAge: true, dependentMaxAge: true },
      });
      assertEnrolmentAge(
        {
          relationship,
          dateOfBirth,
          firstName: demographics.value.firstName,
          lastName: demographics.value.lastName,
        },
        effectiveDate,
        ageRules,
      );

      // ── Duplicate detection (M-005/006/007) ────────────────────────────────────
      // Normalize BEFORE probing so identity variants collide: national ID by
      // case/interior-space, phone across +256 / 256 / 0 formats, email by case.
      // New members are then STORED in the normalized form so the probes stay
      // consistent (idKey/phoneKey/emailKey below).
      const idKey = data.idNumber?.trim() ? normalizeNationalId(data.idNumber) : "";
      const emailKey = demographics.value.email ?? "";

      // ── UAT-HF P05.04 — DEF-078 / DEC-07 ─────────────────────────────────────
      // These four probes used to throw messages naming the other member and
      // their member number, e.g. 'A member with phone "…" already exists:
      // Margaret Bukenya (NWSC-2026-00362)' — including members in a different
      // client group. That turned the enrolment form into an identifier lookup:
      // supply a phone, learn who holds it, one guess at a time.
      //
      // Two things change. The messages no longer name anybody, and only the
      // NATIONAL ID still blocks: DEC-07 is explicit that "a principal and their
      // dependants routinely share one number", so refusing a duplicate phone was
      // both a disclosure and simply wrong. Phone, email and name+DOB now flow
      // into the same `warnings` channel the form already renders.
      const identityMatches = await findIdentityMatches(tx, tenantId, {
        nationalId: data.idNumber,
        phone: phoneKey,
        email: emailKey,
        firstName: demographics.value.firstName,
        lastName: demographics.value.lastName,
        dateOfBirth,
      });

      const blocking = blockingMatch(identityMatches);
      if (blocking) {
        // Still a hard stop — the run noted this guard "is also the only thing
        // that prevented a duplicate member after the silently committed write in
        // O-005". The protection stays; only the disclosure goes.
        throw new DuplicateIdentityError(blockingMessage(blocking));
      }

      const identityWarnings = candidateWarnings(identityMatches);

      // ── Enrollment fraud risk check (soft warnings, never blocks) ────────────
      const enrollmentWarnings = await FraudService.checkEnrollmentRisk({
        groupId: data.groupId,
        tenantId,
        dateOfBirth,
        relationship,
      });
      // ─────────────────────────────────────────────────────────────────────────

      // Generate member number (client-configurable prefix, G9.6). NW-D01: derive
      // the prefix from the owning Client so members inherit e.g. NWSC-… not MVX-…
      const memberNumber = await nextMemberNumber(tenantId, effectiveGroup.clientId, tx);

      // Auto-assign the scheme's default benefit tier (the mechanism existed; only
      // the call was missing — members otherwise landed with a null tier).
      const benefitTierId = await GroupsService.resolveDefaultTierId(effectiveGroup.id);

      const member = await tx.member.create({
        data: {
          tenantId,
          memberNumber,
          groupId: effectiveGroup.id,
          firstName: demographics.value.firstName,
          lastName: demographics.value.lastName,
          // Store the NORMALIZED identity keys so dedup stays consistent going forward.
          idNumber: idKey || null,
          dateOfBirth,
          gender: demographics.value.gender,
          phone: phoneKey,
          email: emailKey || null,
          addressCountry: address.addressCountry,
          addressDistrict: address.addressDistrict,
          addressLocality: address.addressLocality,
          addressSubcounty: address.addressSubcounty,
          addressParish: address.addressParish,
          addressVillage: address.addressVillage,
          addressLine: address.addressLine,
          addressLatitude: address.addressLatitude,
          addressLongitude: address.addressLongitude,
          addressCoordinateConsentAt,
          relationship: relationship as MemberRelationship,
          principalId: data.principalId,
          benefitTierId,
          packageId: effectiveGroup.packageId,
          packageVersionId: effectiveGroup.packageVersionId,
          enrollmentDate: effectiveDate,
          coverStartDate: effectiveDate,
          birthNotificationDate,
          status: "ACTIVE", // For milestone simplicity
          // UAT-HF P05.01: the canonical keys, written at enrolment. Without them
          // a new member is unkeyed and invisible to the canonical search — the
          // asymmetry that caused DEF-030 in the first place.
          ...memberIdentityKeys({
            idNumber: idKey || null,
            phone: phoneKey,
            email: emailKey || null,
            memberNumber,
            firstName: demographics.value.firstName,
            lastName: demographics.value.lastName,
          }),
        },
      });

      // WP-3.5E: open a coverage period from the effective date so the point-in-time
      // engine (coverageService) sees this member. Manually / import-enrolled members
      // previously got NONE — the eligibility engine was blind to them. Idempotent.
      await coverageService.openPeriod(tx, tenantId, member.id, effectiveDate, data.coveragePeriodReason ?? "ENROLMENT");

      // P05.04: candidate identity matches are warnings, never blocks (DEC-07).
      return { member, warnings: [...identityWarnings, ...enrollmentWarnings] };
    });
  }

  /**
   * Updates editable fields on an existing member
   */
  /**
   * UAT-HF P05.05 — a profile edit: demographics only, conditional on the copy
   * the operator loaded.
   *
   * Replaces `updateMember`, which took `status` alongside the demographics and
   * wrote every field unconditionally. That is DEF-077 (silent lost update) and
   * DEF-041/DEF-043 (a lifecycle change with the ceremony of a spelling fix) in
   * one method.
   *
   * Returns STALE — having written nothing — when the record moved underneath
   * the operator. The precondition is in the WHERE clause, so the check and the
   * write are one statement and there is no window between them.
   */
  static async updateProfile(
    tenantId: string,
    memberId: string,
    edits: Partial<{
      firstName: string;
      lastName: string;
      otherNames: string;
      idNumber: string;
      dateOfBirth: string;
      gender: string;
      phone: string;
      email: string;
      relationship: string;
      addressCountry: string;
      addressDistrict: string;
      addressLocality: string;
      addressSubcounty: string;
      addressParish: string;
      addressVillage: string;
      addressLine: string;
      addressLatitude: string;
      addressLongitude: string;
      addressCoordinateConsent: string | boolean;
    }>,
    expected: ExpectedState,
  ): Promise<PreconditionOutcome> {
    if (Object.keys(edits).length === 0) return "APPLIED";

    const demographics = validateMemberDemographicEdits(edits);
    if (!demographics.ok) {
      throw new Error(Object.values(demographics.fieldErrors).flat().join(" "));
    }
    const canonical = demographics.value;

    if (edits.relationship !== undefined) {
      const familyRole = await prisma.member.findFirst({
        where: { id: memberId, tenantId },
        select: { principalId: true, _count: { select: { dependents: true } } },
      });
      if (!familyRole) throw new Error("Member not found");
      if (canonical.relationship === "PRINCIPAL" && familyRole.principalId) {
        throw new Error(
          "A dependant cannot be changed into a principal from profile editing because it would retain its existing family link.",
        );
      }
      if (canonical.relationship !== "PRINCIPAL" && !familyRole.principalId) {
        throw new Error(
          "A principal cannot be changed into a dependant from profile editing. Link the member through a governed family correction instead.",
        );
      }
      if (canonical.relationship !== "PRINCIPAL" && familyRole._count.dependents > 0) {
        throw new Error("A member who owns dependants cannot be changed into a dependant.");
      }
    }

    // P05.04: identity rules are the same in every channel. National ID blocks;
    // a shared phone does not (DEC-07).
    if (edits.idNumber !== undefined || edits.phone !== undefined) {
      const matches = await findIdentityMatches(
        prisma,
        tenantId,
        { nationalId: edits.idNumber, phone: canonical.phone ?? undefined },
        { excludeMemberId: memberId },
      );
      const blocking = blockingMatch(matches);
      if (blocking) throw new DuplicateIdentityError(blockingMessage(blocking));
    }

    const data: Prisma.MemberUpdateInput = {};
    if (edits.firstName !== undefined) data.firstName = canonical.firstName;
    if (edits.lastName !== undefined) data.lastName = canonical.lastName;
    if (edits.otherNames !== undefined) data.otherNames = edits.otherNames || null;
    if (edits.idNumber !== undefined) {
      data.idNumber = edits.idNumber ? normalizeNationalId(edits.idNumber) : null;
    }
    if (edits.dateOfBirth !== undefined) {
      const dates = resolveMemberEnrolmentDates({
        dateOfBirth: edits.dateOfBirth,
        relationship: edits.relationship,
      });
      if (!dates.ok) throw new Error(dates.fieldErrors.dateOfBirth?.[0] ?? "Enter a valid date of birth.");
      data.dateOfBirth = calendarDateToUtcDate(dates.value.dateOfBirth)!;
    }
    if (edits.gender !== undefined) data.gender = canonical.gender as Gender;
    if (edits.phone !== undefined) {
      data.phone = canonical.phone;
    }
    if (edits.email !== undefined) data.email = canonical.email;
    if (edits.relationship !== undefined) {
      data.relationship = canonical.relationship as MemberRelationship;
    }

    const addressChanged = MEMBER_ADDRESS_FIELDS.some((field) => edits[field] !== undefined);
    if (addressChanged) {
      const currentAddress = await prisma.member.findFirst({
        where: { id: memberId, tenantId },
        select: {
          addressCountry: true,
          addressDistrict: true,
          addressLocality: true,
          addressSubcounty: true,
          addressParish: true,
          addressVillage: true,
          addressLine: true,
          addressLatitude: true,
          addressLongitude: true,
          addressCoordinateConsentAt: true,
        },
      });
      if (!currentAddress) throw new Error("Member not found");
      const addressResult = validateMemberAddress({
        addressCountry: edits.addressCountry ?? currentAddress.addressCountry,
        addressDistrict: edits.addressDistrict ?? currentAddress.addressDistrict,
        addressLocality: edits.addressLocality ?? currentAddress.addressLocality,
        addressSubcounty: edits.addressSubcounty ?? currentAddress.addressSubcounty,
        addressParish: edits.addressParish ?? currentAddress.addressParish,
        addressVillage: edits.addressVillage ?? currentAddress.addressVillage,
        addressLine: edits.addressLine ?? currentAddress.addressLine,
        addressLatitude: edits.addressLatitude ?? currentAddress.addressLatitude?.toString(),
        addressLongitude: edits.addressLongitude ?? currentAddress.addressLongitude?.toString(),
        addressCoordinateConsent:
          edits.addressCoordinateConsent ??
          (currentAddress.addressCoordinateConsentAt ? "on" : ""),
      });
      if (!addressResult.ok) {
        throw new Error(Object.values(addressResult.fieldErrors).flat().join(" "));
      }
      const address = addressResult.value;
      data.addressCountry = address.addressCountry;
      data.addressDistrict = address.addressDistrict;
      data.addressLocality = address.addressLocality;
      data.addressSubcounty = address.addressSubcounty;
      data.addressParish = address.addressParish;
      data.addressVillage = address.addressVillage;
      data.addressLine = address.addressLine;
      data.addressLatitude = address.addressLatitude;
      data.addressLongitude = address.addressLongitude;
      data.addressCoordinateConsentAt = address.hasCoordinateConsent ? new Date() : null;
    }

    // P05.01: keep the canonical keys in step with the fields they derive from,
    // or an edit silently un-keys the member for search.
    if (edits.idNumber !== undefined) {
      data.nationalIdNormalized = edits.idNumber ? normalizeNationalId(edits.idNumber) : null;
    }
    if (edits.phone !== undefined) {
      data.phoneNormalized = canonical.phone;
    }
    if (edits.email !== undefined) {
      data.emailNormalized = canonical.email;
    }
    if (edits.firstName !== undefined || edits.lastName !== undefined || edits.otherNames !== undefined) {
      const names = await prisma.member.findFirst({
        where: { id: memberId, tenantId },
        select: { firstName: true, lastName: true, otherNames: true },
      });
      data.searchNameNormalized = normalizeSearchName({
        firstName: canonical.firstName ?? names?.firstName,
        lastName: canonical.lastName ?? names?.lastName,
        otherNames: edits.otherNames ?? names?.otherNames,
      });
    }

    // P04.05: bump the row version alongside the write, so a future precondition
    // can use it instead of the millisecond-granular updatedAt.
    data.version = { increment: 1 };

    return applyWithPrecondition(
      async ({ expected: exp }) =>
        prisma.member.updateMany({
          // The precondition IS the WHERE clause. Reading the row and then
          // updating it leaves exactly the race this closes.
          //
          // UAT-HF P05.01 completion: `version` is included when the client
          // sent one. `updatedAt` is millisecond-granular, so two saves inside
          // the same millisecond both matched it and the second silently
          // overwrote the first — the exact DEF-077 failure the precondition
          // exists to stop. The version column was already being incremented
          // below; nothing read it. Both are compared, so a row written by an
          // older code path that bumps only `updatedAt` is still caught.
          where: {
            id: memberId,
            tenantId,
            updatedAt: new Date(exp.updatedAt),
            ...(exp.version !== undefined ? { version: exp.version } : {}),
          },
          data,
        }),
      expected,
    );
  }

  /**
   * UAT-HF P05.05 — a lifecycle status change, as its own command.
   *
   * Deliberately separate from {@link updateProfile}: the caller supplies a
   * reason and gets a distinct audit action. Coverage effects are preserved
   * from the old `updateMember` — suspending closes the open period, and
   * reinstating from SUSPENDED opens a fresh one, so point-in-time eligibility
   * stays correct across the gap.
   *
   * P07.01 replaces this with the full transition policy table.
   */
  /**
   * UAT-HF P07.02 — the lifecycle transition, executed atomically.
   *
   * Three faults were in the previous shape, and the middle one is a money bug:
   *
   * **1. Read-then-write.** `findFirst` then `update` with no precondition, so
   * two operators reading the same ACTIVE member both passed the check and both
   * wrote. The update is now conditional on the status (and the version, when
   * the caller supplies one), and a `count` of 0 is reported as a stale command
   * rather than silently succeeding.
   *
   * **2. The status write and the coverage period were separate transactions.**
   * A failure in between left a SUSPENDED member with an **open coverage
   * period** — which is what the claim rails read, so the member stayed
   * eligible while the roster said otherwise. `coverageService` already took a
   * transaction client for exactly this reason; the caller passed the global
   * one. P07.02's acceptance is "injected failure at each write boundary rolls
   * back the entire command", and one `$transaction` is what makes that true.
   *
   * **3. The coverage boundary was `new Date()`.** DEC-12 says the operator's
   * date is the LAST COVERED DAY and ineligibility starts the following day.
   * Closing the period at "now" instead silently moved the boundary to whenever
   * the button was clicked, which for a back-dated suspension is wrong by
   * however many days it was back-dated.
   */
  static async changeStatus(
    tenantId: string,
    memberId: string,
    next: MemberStatus,
    options: {
      /** DEC-12 — the last covered day. Defaults to now for a live change. */
      effectiveAt?: Date;
      /** Optimistic precondition; omit to fall back to the status check alone. */
      expectedVersion?: number;
      /**
       * P07.02 — recorded in the SAME transaction as the state change, so a
       * crash between the two cannot leave a change with no trail.
       */
      event?: {
        actor?: { id?: string; name?: string; role?: string };
        reasonNote?: string;
        correlationId?: string;
      };
    } = {},
  ) {
    const member = await prisma.member.findFirst({
      where: { id: memberId, tenantId },
      select: { id: true, status: true, version: true },
    });
    if (!member) throw new Error("Member not found");

    if (!canEditTransition(member.status, next)) {
      throw new Error(
        `Cannot change member status from ${member.status} to ${next} from the edit path. ` +
          `${member.status} is a governed lifecycle state — use the reinstatement / lifecycle flow instead.`,
      );
    }

    const boundary = options.effectiveAt ?? new Date();

    return prisma.$transaction(async (tx) => {
      // The precondition IS the WHERE clause. Reading the row and then updating
      // it leaves exactly the race this closes.
      const claimed = await tx.member.updateMany({
        where: {
          id: memberId,
          tenantId,
          status: member.status,
          ...(options.expectedVersion !== undefined ? { version: options.expectedVersion } : {}),
        },
        data: { status: next, version: { increment: 1 } },
      });

      if (claimed.count !== 1) {
        // Somebody else moved this member between the read and the write. The
        // transaction rolls back, so no coverage period is touched either.
        throw new StaleMemberTransitionError(member.status);
      }

      // Same `tx`. This is the whole point: a failure here rolls the status
      // change back rather than leaving the two halves disagreeing.
      if (member.status !== "SUSPENDED" && next === "SUSPENDED") {
        await coverageService.closeOpenPeriods(tx, memberId, boundary, "SUSPENDED");
      } else if (member.status === "SUSPENDED" && next === "ACTIVE") {
        await coverageService.openPeriod(tx, tenantId, memberId, boundary, "REINSTATEMENT");
      }

      // P07.02's last limb: "persist event/outbox/receipt" — in this
      // transaction, not after it.
      //
      // The audit row was written by the action AFTER the commit, so a crash in
      // between produced a status change with no trail. DomainEventService.record
      // has taken a transaction client from the start and says so in its own
      // comment ("Pass the SAME transaction client as the state change — that
      // coupling is the whole point"); the lifecycle path simply never did.
      if (options.event) {
        await DomainEventService.record(
          {
            tenantId,
            eventType: `member.lifecycle.${next.toLowerCase()}`,
            entityType: "MEMBER",
            entityId: memberId,
            description: `Member status ${member.status} → ${next}`,
            actor: options.event.actor,
            occurredAt: boundary,
            payload: {
              previousStatus: member.status,
              newStatus: next,
              effectiveAt: boundary.toISOString(),
            },
            reasonNote: options.event.reasonNote,
            correlationId: options.event.correlationId,
          },
          tx,
        );
      }

      // No re-read. The conditional update above succeeded, so the row's status
      // is exactly `next` — querying again would cost a round trip inside the
      // transaction to learn something already known.
      return { member: { ...member, status: next }, previousStatus: member.status };
    });
  }
}
