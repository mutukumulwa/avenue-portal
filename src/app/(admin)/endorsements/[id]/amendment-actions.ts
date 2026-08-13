"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { amendmentService } from "@/server/services/amendment.service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function computeProRataAction(formData: FormData) {
  const session = await requireRole(ROLES.MEMBER_OPS);
  const endorsementId = formData.get("endorsementId") as string;
  await amendmentService.computeProRata(endorsementId, session.user.tenantId);
  revalidatePath(`/endorsements/${endorsementId}`);
}

export async function submitAmendmentAction(formData: FormData) {
  const session = await requireRole(ROLES.MEMBER_OPS);
  const endorsementId = formData.get("endorsementId") as string;
  await amendmentService.submitForApproval(endorsementId, session.user.tenantId, session.user.id);
  revalidatePath(`/endorsements/${endorsementId}`);
}

export async function approveAmendmentAction(formData: FormData) {
  const session = await requireRole(ROLES.MEMBER_OPS);
  const endorsementId = formData.get("endorsementId") as string;
  const notes = (formData.get("notes") as string) || undefined;
  await amendmentService.approveAmendment(endorsementId, session.user.tenantId, session.user.id, notes);
  revalidatePath(`/endorsements/${endorsementId}`);
}

export async function applyAmendmentAction(formData: FormData) {
  const session = await requireRole(ROLES.MEMBER_OPS);
  const endorsementId = formData.get("endorsementId") as string;
  await amendmentService.applyAmendment(endorsementId, session.user.tenantId, session.user.id);
  revalidatePath(`/endorsements/${endorsementId}`);
}

export async function rejectAmendmentAction(formData: FormData) {
  const session = await requireRole(ROLES.MEMBER_OPS);
  const endorsementId = formData.get("endorsementId") as string;
  const reason = formData.get("reason") as string;
  await amendmentService.rejectAmendment(endorsementId, session.user.tenantId, session.user.id, reason);
  revalidatePath(`/endorsements/${endorsementId}`);
}

/**
 * UAT-HF P08.03 (DEF-046) — supply the E-015 source reference on an endorsement
 * that was raised before the creation form asked for one.
 *
 * P08.03 stops NEW requests entering an unapprovable state. It does nothing for
 * the ones already there — the run left "four HR-submitted requests and three
 * controlled endorsements ... stuck at SUBMITTED", and without a route out the
 * only way to clear them is to reject work that was substantively correct.
 *
 * **The maker supplies it, never the checker.** A checker who can add the
 * evidence and then approve on it has approved their own paperwork, which is the
 * separation E-015 exists to enforce. The service refuses the write for anyone
 * who is not the maker; the UI only explains why the control is absent.
 */
export async function supplyEndorsementEvidenceAction(formData: FormData) {
  const session = await requireRole(ROLES.MEMBER_OPS);
  const endorsementId = formData.get("endorsementId") as string;
  const sourceReference = (formData.get("sourceReference") as string) ?? "";

  const result = await amendmentService.supplyMaterialEvidence(
    endorsementId,
    session.user.tenantId,
    session.user.id,
    sourceReference,
  );

  // A refusal surfaces as the page's existing `?error=` banner rather than a
  // return value: a server action used directly as `<form action>` must resolve
  // to void, and this page already renders that banner for every other control
  // violation (PR-033/PR-009).
  if (!result.ok) {
    redirect(`/endorsements/${endorsementId}?error=${encodeURIComponent(result.error)}`);
  }

  revalidatePath(`/endorsements/${endorsementId}`);
}
