"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { PackagesService } from "@/server/services/packages.service";
import { writeAudit } from "@/lib/audit";
import { fail, type ActionResult } from "@/lib/action-result";
import { packageCreateSchema } from "@/lib/validation/package";

export async function createPackageAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireRole(ROLES.UNDERWRITING);
  const tenantId = session.user.tenantId;

  // Each core benefit carries its funding model (WP-F1/D8) — preserved through
  // to the service; the schema validates the money/percent projection.
  type FundingModel = "FEE_FOR_SERVICE" | "CAPITATION" | "HYBRID";
  const readFunding = (prefix: string) => {
    const model = (formData.get(`${prefix}FundingModel`) as FundingModel) || "FEE_FOR_SERVICE";
    const capitatedTiers = formData.getAll(`${prefix}CapitatedTiers`).map(String);
    const fundingOverrides =
      model === "HYBRID" && capitatedTiers.length > 0
        ? capitatedTiers.map((tier) => ({ tier, model: "CAPITATION" as const }))
        : undefined;
    return { fundingModel: model, fundingOverrides };
  };

  const perVisitOf = (raw: FormDataEntryValue | null): string | null =>
    raw == null || raw === "" ? null : String(raw);

  const inpatientLimit = Number(formData.get("inpatientLimit") || 0);
  const outpatientLimit = Number(formData.get("outpatientLimit") || 0);
  const annualLimitNum = Number(formData.get("annualLimit") || 0);

  type BuilderBenefit = {
    category: "INPATIENT" | "OUTPATIENT";
    annualSubLimit: number | string;
    copayPercentage: number;
    perVisitLimit: string | null;
    fundingModel: FundingModel;
    fundingOverrides?: { tier: string; model: "FEE_FOR_SERVICE" | "CAPITATION" }[];
  };
  const benefits: BuilderBenefit[] = [];
  // Maps benefit array index → the form fields its errors should attach to.
  const sources: { limitField: string; perVisitField: string }[] = [];

  if (inpatientLimit > 0) {
    benefits.push({ category: "INPATIENT", annualSubLimit: inpatientLimit, copayPercentage: 0, perVisitLimit: perVisitOf(formData.get("inpatientPerVisit")), ...readFunding("inpatient") });
    sources.push({ limitField: "inpatientLimit", perVisitField: "inpatientPerVisit" });
  }
  if (outpatientLimit > 0) {
    benefits.push({ category: "OUTPATIENT", annualSubLimit: outpatientLimit, copayPercentage: 0, perVisitLimit: perVisitOf(formData.get("outpatientPerVisit")), ...readFunding("outpatient") });
    sources.push({ limitField: "outpatientLimit", perVisitField: "outpatientPerVisit" });
  }
  if (benefits.length === 0) {
    benefits.push({ category: "INPATIENT", annualSubLimit: annualLimitNum, copayPercentage: 0, perVisitLimit: null, fundingModel: "FEE_FOR_SERVICE" });
    sources.push({ limitField: "inpatientLimit", perVisitField: "inpatientPerVisit" });
  }

  // Route the create through the SAME canonical schema as the tRPC door.
  const parsed = packageCreateSchema.safeParse({
    name: (formData.get("name") ?? "") as string,
    description: (formData.get("description") as string) || null,
    type: formData.get("type"),
    annualLimit: formData.get("annualLimit"),
    contributionAmount: formData.get("contributionAmount"),
    minAge: formData.get("minAge"),
    maxAge: formData.get("maxAge"),
    benefits: benefits.map((b) => ({
      category: b.category,
      annualSubLimit: b.annualSubLimit,
      copayPercentage: b.copayPercentage,
      perVisitLimit: b.perVisitLimit,
    })),
  });

  if (!parsed.success) {
    const fe = parsed.error.flatten().fieldErrors;
    const fieldErrors: Record<string, string[]> = {};
    for (const k of ["name", "type", "annualLimit", "contributionAmount", "minAge", "maxAge"] as const) {
      if (fe[k]) fieldErrors[k] = fe[k]!;
    }
    // Translate benefits[i].field issues back to the builder's own input names.
    for (const issue of parsed.error.issues) {
      if (issue.path[0] === "benefits" && typeof issue.path[1] === "number") {
        const src = sources[issue.path[1]];
        if (!src) continue;
        const target = issue.path[2] === "perVisitLimit" ? src.perVisitField : src.limitField;
        (fieldErrors[target] ??= []).push(issue.message);
      }
    }
    return fail(fieldErrors);
  }

  const created = await PackagesService.createPackage(tenantId, {
    name: parsed.data.name,
    description: parsed.data.description ?? undefined,
    type: parsed.data.type,
    annualLimit: parsed.data.annualLimit,
    contributionAmount: parsed.data.contributionAmount,
    minAge: parsed.data.minAge,
    maxAge: parsed.data.maxAge,
    status: "ACTIVE",
    benefits: parsed.data.benefits.map((pb, i) => ({
      category: pb.category as "INPATIENT" | "OUTPATIENT",
      annualSubLimit: pb.annualSubLimit,
      copayPercentage: pb.copayPercentage ?? 0,
      perVisitLimit: pb.perVisitLimit ?? null,
      fundingModel: benefits[i].fundingModel,
      fundingOverrides: benefits[i].fundingOverrides,
    })),
  });

  await writeAudit({
    userId: session.user.id,
    action: "PACKAGE_CREATE",
    module: "PACKAGES",
    description: `Package "${parsed.data.name}" created`,
    metadata: {
      packageId: created.id,
      type: parsed.data.type,
      annualLimit: String(parsed.data.annualLimit),
      benefitCount: parsed.data.benefits.length,
    },
  });

  redirect("/packages");
}
