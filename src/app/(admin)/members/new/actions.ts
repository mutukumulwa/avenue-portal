"use server";

/**
 * UAT-HF P04.01 — member enrolment on the mutation envelope.
 *
 * DEF-034: "Submitting a completed enrolment with a rapid double-click creates
 * NOTHING — the member count is unchanged and a search returns '0 of 2780
 * results' — and the user is told nothing at all: no success message, no error,
 * no alert, and the form simply remains on screen."
 *
 * The defect register's recommended fix was to disable the primary action while
 * the submission is in flight. **That was already implemented at the tested
 * build** (`disabled={pending}` is present in `53df0ab`) and the defect happened
 * anyway — the run measured `disabled=false` 120 ms after the first click.
 *
 * It cannot work: `useActionState`'s `pending` only flips once React begins the
 * transition, so a fast second click lands on a still-live control and aborts
 * the first submission. This is precisely what plan §1.1 means by "client-side
 * disabled buttons are being used where server-side idempotency and
 * reconciliation are required".
 *
 * So the real fix is an `OperationReceipt` (P01.02) keyed on an id the CLIENT
 * mints once per draft: the first submit reserves it and writes; a second
 * submit of the same draft finds the reservation and either replays the stored
 * result or reports that the first is still running. Either way the operator
 * gets a terminal, discoverable answer instead of a blank form.
 */
import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { MembersService } from "@/server/services/members.service";
import { writeAudit } from "@/lib/audit";
import {
  OPERATION_ID_FIELD,
  mutationFail,
  mutationOk,
  toMutationFailure,
  type MutationResult,
} from "@/lib/mutation-contract";
import { newCorrelationId } from "@/lib/correlation";
import { OperationReceiptService } from "@/server/services/operation-receipt.service";

const OPERATION_TYPE = "members.create";

export interface MemberCreated {
  memberNumber: string;
  memberId: string;
  warnings: string[];
}

export async function addMemberAction(
  _previous: MutationResult<MemberCreated> | null,
  formData: FormData,
): Promise<MutationResult<MemberCreated>> {
  const session = await requireRole(ROLES.MEMBER_OPS);
  const tenantId = session.user.tenantId;
  const correlationId = newCorrelationId();

  const data = {
    groupId: formData.get("groupId") as string,
    firstName: formData.get("firstName") as string,
    lastName: formData.get("lastName") as string,
    idNumber: formData.get("idNumber") as string,
    dateOfBirth: formData.get("dateOfBirth") as string,
    gender: formData.get("gender") as "MALE" | "FEMALE" | "OTHER",
    phone: formData.get("phone") as string,
    email: formData.get("email") as string,
    relationship: formData.get("relationship") as "PRINCIPAL" | "SPOUSE" | "CHILD" | "PARENT" | "SIBLING",
    // NW-D02: link a dependant to its principal when the form was opened from a
    // principal's "Add Dependent" action (/members/new?principalId=…).
    principalId: (formData.get("principalId") as string | null)?.trim() || undefined,
    // WP-3.5E: enrolment effective date drives enrollmentDate + coverage period.
    effectiveDate: (formData.get("effectiveDate") as string | null)?.trim() || undefined,
    // WP-3.5F newborn (CT-033): when supplied and within 30 days of DOB, cover
    // starts from the date of birth (and no national ID is required).
    birthNotificationDate: (formData.get("birthNotificationDate") as string | null)?.trim() || undefined,
  };

  const idempotencyKey = String(formData.get(OPERATION_ID_FIELD) ?? "").trim();
  if (!idempotencyKey) {
    // Without a client-minted key this call cannot be made idempotent, and a
    // double-click would be two real writes. Refuse rather than risk it.
    return mutationFail("VALIDATION", {
      correlationId,
      message: "This form could not be submitted safely. Reload the page and try again.",
    });
  }

  try {
    const reservation = await OperationReceiptService.reserve({
      tenantId,
      actorId: session.user.id,
      operationType: OPERATION_TYPE,
      idempotencyKey,
      request: data,
      correlationId,
    });

    switch (reservation.status) {
      case "REPLAY":
        // The DEF-034 double-click, answered honestly: the first click already
        // enrolled this member, so say so rather than writing again.
        return mutationOk<MemberCreated>(idempotencyKey, {
          replayed: true,
          entityRef: reservation.receipt.entityRef ?? undefined,
          nextAction: "View member",
          data: {
            memberNumber: reservation.receipt.entityRef ?? "",
            memberId: reservation.receipt.entityId ?? "",
            warnings: [],
          },
        });

      case "IN_PROGRESS":
        return mutationFail("CONFLICT", {
          correlationId,
          operationId: idempotencyKey,
          message: "This enrolment is already being processed. Wait a moment, then refresh to see the result.",
        });

      case "UNKNOWN_PRIOR":
        return mutationFail("UNKNOWN_OUTCOME", { correlationId, operationId: idempotencyKey });

      case "CONFLICT":
        return mutationFail("CONFLICT", {
          correlationId,
          operationId: idempotencyKey,
          message: "The details changed after this form was opened. Reload the page and enter the enrolment again.",
        });

      case "RESERVED":
      default:
        break;
    }

    const receiptId = reservation.receipt.id;
    const result = await MembersService.createMember(tenantId, data);

    await OperationReceiptService.succeed(receiptId, {
      entityType: "Member",
      entityId: result.member.id,
      entityRef: result.member.memberNumber,
    });

    await writeAudit({
      userId: session.user.id,
      action: "MEMBER_CREATED",
      module: "MEMBERS",
      description: `New member enrolled: ${data.firstName} ${data.lastName} (${result.member.memberNumber})`,
      metadata: { groupId: data.groupId, relationship: data.relationship, correlationId },
    });

    return mutationOk<MemberCreated>(idempotencyKey, {
      entityRef: result.member.memberNumber,
      nextAction: "View member",
      data: {
        memberNumber: result.member.memberNumber,
        memberId: result.member.id,
        warnings: result.warnings,
      },
    });
  } catch (err) {
    // The write may have rolled back or may not have run at all; either way the
    // receipt is left non-terminal so the outcome stays discoverable rather than
    // being asserted wrongly.
    return toMutationFailure(err, { operation: OPERATION_TYPE, operationId: idempotencyKey, correlationId });
  }
}

/**
 * Look up how a previous enrolment attempt ended, by its operation id.
 *
 * This is what "check before you retry" actually needs. DEF-034's operator was
 * given a blank form and no way to find out whether anything had happened.
 */
export async function lookupEnrolmentOutcomeAction(operationId: string) {
  const session = await requireRole(ROLES.MEMBER_OPS);
  return OperationReceiptService.lookup(
    {
      tenantId: session.user.tenantId,
      actorId: session.user.id,
      operationType: OPERATION_TYPE,
      idempotencyKey: operationId,
    },
    prisma,
  );
}
