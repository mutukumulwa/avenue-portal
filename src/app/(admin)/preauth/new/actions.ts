"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { PreauthIntakeService } from "@/server/services/preauth-intake/service";
import { preauthAdjudicationService } from "@/server/services/preauth-adjudication.service";
import { getSystemActorId } from "@/server/services/system-actor.service";
import { writeAudit } from "@/lib/audit";
import {
  MemberActionGuardService,
  memberActionRefusal,
} from "@/server/services/member-action-guard.service";
import type { ServiceType, BenefitCategory } from "@prisma/client";

export async function submitPreAuthAction(
  _prev: { error?: string; warnings?: string[] } | null,
  formData: FormData
): Promise<{ error?: string; warnings?: string[] }> {
  const session = await requireRole(ROLES.CLINICAL);

  const tenantId = session.user.tenantId;
  const estimatedCost = Number(formData.get("estimatedCost"));
  const diagnosis = formData.get("diagnosis") as string;

  const memberId        = formData.get("memberId")        as string;
  const benefitCategory = formData.get("benefitCategory") as BenefitCategory;
  const providerId      = formData.get("providerId")      as string;

  const verdict = await MemberActionGuardService.evaluate({
    tenantId,
    memberId,
    action: "PREAUTH",
  });
  if (!verdict.allowed) return { error: memberActionRefusal(verdict) };

  // F3.5b: converge on the canonical intake + pipeline. This rail submits through
  // PreauthIntakeService (channel ADMIN_PORTAL) — the SAME path the B2B (F3.4) and
  // member (F3.5a) rails use — with the post-commit auto-decision wired to
  // preauthAdjudicationService.executeAutoDecision (10-gate pipeline is the single
  // decision owner). No direct createPreAuth; no bespoke auto-approve. Fraud is now
  // ENFORCED by the pipeline's FRAUD_SCREENING gate rather than shown as an
  // advisory inline warning, so the old warnings-then-redirect branch is gone.
  let result: Awaited<ReturnType<typeof PreauthIntakeService.submit>>;
  try {
    result = await PreauthIntakeService.submit(
      { channel: "ADMIN_PORTAL", tenantId, providerId, actorType: "USER", actorId: session.user.id },
      {
        memberId,
        providerId,
        serviceType: formData.get("serviceType") as ServiceType,
        expectedDateOfService: formData.get("expectedDateOfService")
          ? new Date(formData.get("expectedDateOfService") as string)
          : undefined,
        diagnoses: [{ description: diagnosis, isPrimary: true }],
        procedures: [{ description: (formData.get("procedure") as string) || "Medical services", unitCost: estimatedCost, total: estimatedCost }],
        estimatedCost,
        clinicalNotes: (formData.get("clinicalNotes") as string) || undefined,
        benefitCategory,
      },
      {
        adjudicate: async (preauthId, tid) => {
          await preauthAdjudicationService.executeAutoDecision(preauthId, tid, await getSystemActorId(tid));
        },
      },
    );
  } catch (err) {
    return { error: (err as Error).message };
  }

  if (result.status === "REJECTED" || !result.preauthId) {
    return { error: result.errors?.[0]?.message ?? "The pre-authorization could not be submitted." };
  }

  await writeAudit({
    userId: session.user.id,
    action: "PREAUTH_SUBMITTED",
    module: "PREAUTH",
    description: `Pre-auth submitted for member ${memberId.slice(0, 8)} — ${benefitCategory}, UGX ${estimatedCost.toLocaleString()}`,
    metadata: { memberId, benefitCategory, estimatedCost, preauthId: result.preauthId, receiptId: result.receiptId, replayed: result.replayed },
  });

  redirect("/preauth");
}
