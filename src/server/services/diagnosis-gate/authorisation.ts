/**
 * Diagnosis Gate — capability resolution (C3.5).
 *
 * THE PROBLEM THIS SOLVES. The platform has two authorisation models living side by
 * side. Almost everything (214 admin surfaces) gates on `User.role` via `requireRole`.
 * A handful of newer services gate on granular capabilities via
 * `rbacService.hasPermission`, which reads `UserRoleAssignment → Role → Permission`.
 *
 * Production runs entirely on the first model: it has **zero** `Role`, `Permission`,
 * `RolePermission` and `UserRoleAssignment` rows. And `hasPermission` has no
 * SUPER_ADMIN bypass — with no assignments it returns false for *everyone*. A feature
 * gated purely on granular capabilities is therefore visible but inoperable there:
 * the page renders (its `requireRole` passes) and every button refuses.
 *
 * THE RULE IMPLEMENTED HERE, in order:
 *   1. If the user holds the capability granularly → allow.
 *   2. If the user has ANY granular role assignment → the granular model is in use for
 *      them, so respect its answer and DENY. A deliberate revocation must not be
 *      undone by a role fallback.
 *   3. Otherwise the granular model is not configured for this user → fall back to the
 *      platform's role model, which is how the rest of the product authorises.
 *
 * This is not a loosening. In an environment with no granular RBAC the capability is
 * currently held by nobody; the fallback grants it to exactly the roles the seed grants
 * it to (`prisma/seeds/rbac.ts`), so both models agree. Maker ≠ checker is unaffected —
 * it is enforced on user identity, never on capabilities.
 */
import { prisma } from "@/lib/prisma";
import { rbacService } from "../rbac.service";
import type { UserRole } from "@/lib/rbac";

export const CLINICAL_PROTOCOL_VIEW = "CLINICAL_PROTOCOL:VIEW";
export const CLINICAL_PROTOCOL_MANAGE = "CLINICAL_PROTOCOL:MANAGE";
export const CLINICAL_PROTOCOL_APPROVE = "CLINICAL_PROTOCOL:APPROVE";
export const CLINICAL_GATE_REVIEW = "CLINICAL_GATE:REVIEW";

/**
 * Roles that hold each capability when granular RBAC is not configured.
 * MUST mirror the grants in `prisma/seeds/rbac.ts` — a test asserts they agree, because
 * two models that disagree would authorise differently per environment.
 */
export const CLINICAL_ROLE_FALLBACK: Record<string, UserRole[]> = {
  // Reading the protocol library and working the clinical queue: the clinical roles.
  [CLINICAL_PROTOCOL_VIEW]: ["SUPER_ADMIN", "CLAIMS_OFFICER", "MEDICAL_OFFICER"],
  [CLINICAL_GATE_REVIEW]: ["SUPER_ADMIN", "CLAIMS_OFFICER", "MEDICAL_OFFICER"],
  // Authoring and approving medicine: clinicians and admins only. A claims officer can
  // work a flagged claim without being able to change the rules that flagged it.
  [CLINICAL_PROTOCOL_MANAGE]: ["SUPER_ADMIN", "MEDICAL_OFFICER"],
  [CLINICAL_PROTOCOL_APPROVE]: ["SUPER_ADMIN", "MEDICAL_OFFICER"],
};

/**
 * Does this user hold a diagnosis-gate capability?
 *
 * `role` is the session's `User.role` — passed in rather than re-queried, since every
 * caller already has the session.
 */
export async function hasClinicalCapability(
  userId: string,
  role: string | null | undefined,
  capability: string,
  tenantId: string,
): Promise<boolean> {
  // 1. Granular grant wins outright.
  const granular = await rbacService.hasPermission(userId, capability, tenantId).catch(() => false);
  if (granular) return true;

  // 2. Granular RBAC in use for this user ⇒ its "no" is authoritative.
  const assignments = await prisma.userRoleAssignment
    .count({ where: { userId, tenantId, isActive: true, status: "ACTIVE" } })
    .catch(() => 0);
  if (assignments > 0) return false;

  // 3. Not configured ⇒ the platform's role model decides.
  const allowed = CLINICAL_ROLE_FALLBACK[capability];
  return !!role && !!allowed && allowed.includes(role as UserRole);
}
