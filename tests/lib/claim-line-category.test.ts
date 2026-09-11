/**
 * Family Hospital UAT plan P01.02 step 3 / DEC-FH-X1 — the explicit taxonomy →
 * claim-line-category mapping. The expectations are the reviewed table in
 * docs/provider-onboarding/FAMILY_HOSPITAL_UAT_DECISIONS.md §4.1, using the real
 * tenant taxonomy shape (codes/tiers from service-category.service.ts CATEGORIES).
 */
import { describe, it, expect } from "vitest";
import {
  CLAIM_LINE_CATEGORIES,
  lineCategoryForTaxonomy,
  taxonomyChain,
  TIER_TO_LINE_CATEGORY,
  type TaxonomyNode,
} from "@/lib/claim-line-category";

type Node = TaxonomyNode & { id: string; parentId: string | null };
const nodes: Node[] = [
  { id: "c", code: "CONSULTATION", tier: "HEADLINE", parentId: null },
  { id: "sc", code: "SPECIALIST_CONSULTATION", tier: null, parentId: "c" },
  { id: "ip", code: "IP_SERVICES", tier: "HEADLINE", parentId: null },
  { id: "icu", code: "ICU", tier: null, parentId: "ip" },
  { id: "lab", code: "LABORATORY", tier: "LABORATORY", parentId: null },
  { id: "rad", code: "RADIOLOGY", tier: "IMAGING", parentId: null },
  { id: "ph", code: "PHARMACY", tier: "PHARMACY", parentId: null },
  { id: "drugs", code: "PHARMACY_DRUGS", tier: null, parentId: "ph" },
  { id: "cons", code: "PHARMACY_CONSUMABLES", tier: null, parentId: "ph" },
  { id: "th", code: "THEATRE", tier: "THEATRE", parentId: null },
  { id: "pf", code: "PROFESSIONAL_FEES", tier: "PROFESSIONAL_FEES", parentId: null },
  { id: "proc", code: "PROCEDURE", tier: "OTHER", parentId: null },
  { id: "minor", code: "MINOR_PROCEDURE", tier: null, parentId: "proc" },
  { id: "pkg", code: "CONTRACT_PACKAGE", tier: "OTHER", parentId: null },
  { id: "dental", code: "DENTAL", tier: "OTHER", parentId: null },
  { id: "orphan", code: "SOMETHING_NEW", tier: null, parentId: null },
];
const byId = new Map(nodes.map((n) => [n.id, n]));
const resolve = (id: string) => lineCategoryForTaxonomy(taxonomyChain(byId, id));

describe("lineCategoryForTaxonomy — the reviewed Family table (DEC-FH-X1)", () => {
  it.each([
    ["c", "CONSULTATION", "TIER"],
    ["sc", "CONSULTATION", "TIER"], // child inherits the parent's HEADLINE tier
    ["ip", "OTHER", "EXPLICIT"], // bed, meals, nursing are not consultations
    ["icu", "OTHER", "EXPLICIT"], // the override on the parent governs the child
    ["lab", "LABORATORY", "TIER"],
    ["rad", "IMAGING", "TIER"],
    ["drugs", "PHARMACY", "TIER"],
    ["cons", "PHARMACY", "TIER"],
    ["th", "PROCEDURE", "TIER"],
    ["pf", "PROCEDURE", "TIER"],
    ["proc", "PROCEDURE", "EXPLICIT"], // tier OTHER is a fee band; the category says Procedure
    ["minor", "PROCEDURE", "EXPLICIT"],
    ["pkg", "OTHER", "TIER"], // meaning unclear generically — not forced
    ["dental", "OTHER", "TIER"],
    ["orphan", "OTHER", "UNMAPPED"], // no tier anywhere → reported for review
  ] as const)("%s → %s (%s)", (id, category, basis) => {
    expect(resolve(id)).toEqual({ category, basis });
  });

  it("maps every tier to a real line category", () => {
    for (const cat of Object.values(TIER_TO_LINE_CATEGORY)) expect(CLAIM_LINE_CATEGORIES).toContain(cat);
  });

  it("an absent or unknown category is OTHER / UNMAPPED, never a guess", () => {
    expect(lineCategoryForTaxonomy(taxonomyChain(byId, null))).toEqual({ category: "OTHER", basis: "UNMAPPED" });
    expect(lineCategoryForTaxonomy(taxonomyChain(byId, "missing"))).toEqual({ category: "OTHER", basis: "UNMAPPED" });
  });

  it("a parent cycle terminates instead of looping", () => {
    const loop = new Map<string, Node>([
      ["a", { id: "a", code: "A", tier: null, parentId: "b" }],
      ["b", { id: "b", code: "B", tier: null, parentId: "a" }],
    ]);
    expect(taxonomyChain(loop, "a").map((n) => n.id)).toEqual(["a", "b"]);
  });
});
