import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { FacilitiesMap, PROCEDURES } from "./FacilitiesMap";
import { referralWarningForProcedure } from "@/lib/member-policy-copy";

/**
 * The member-safe columns of a referral rule.
 *
 * `sourceClause` is the internal contract reference — the schema calls it
 * "never member/provider-facing" — so it is not selected at all. Not fetching
 * it is a stronger guarantee than remembering not to render it.
 */
const SAFE_REFERRAL_FIELDS = {
  benefitCategories: true,
  serviceCodes: true,
  requiresReferral: true,
  emergencyException: true,
  memberSafeExplanation: true,
  isActive: true,
  effectiveFrom: true,
  effectiveTo: true,
} as const;

export default async function MemberFacilitiesPage() {
  // Ensure the user is logged in as a MEMBER
  const session = await requireRole(ROLES.MEMBER);

  /**
   * UAT-HF P09.07 — DEF-060.
   *
   * "Find Care ... offers a Procedure picker including 'Specialist
   * consultation' with a cost preview and no referral note, so the product
   * leads the member to plan and price exactly the visit that will be refused."
   *
   * Resolved server-side, from the member's OWN pinned package version — a rule
   * read from the package's latest version is a rule that may not apply to
   * them. Only `memberSafeExplanation` crosses to the client; `sourceClause` is
   * internal and never fetched here.
   */
  const member = session.user.memberId
    ? await prisma.member.findFirst({
        where: { id: session.user.memberId, tenantId: session.user.tenantId },
        select: {
          packageVersion: { select: { referralRules: { select: SAFE_REFERRAL_FIELDS } } },
          package: {
            select: { currentVersion: { select: { referralRules: { select: SAFE_REFERRAL_FIELDS } } } },
          },
        },
      })
    : null;

  const rules = (member?.packageVersion?.referralRules ??
    member?.package?.currentVersion?.referralRules ??
    []) as {
    benefitCategories: string[];
    serviceCodes: string[];
    requiresReferral: boolean;
    memberSafeExplanation: string;
    isActive: boolean;
    effectiveFrom: Date;
    effectiveTo: Date | null;
  }[];

  const referralWarnings: Record<string, string> = {};
  for (const procedure of PROCEDURES) {
    const warning = referralWarningForProcedure(rules, { serviceCode: procedure.cptCode });
    if (warning) referralWarnings[procedure.cptCode] = warning;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-brand-text-heading">Find Care</h1>
        <p className="text-brand-text-muted mt-1">Find active facilities near you and preview what a common visit may cost.</p>
      </div>

      <FacilitiesMap referralWarnings={referralWarnings} />
    </div>
  );
}
