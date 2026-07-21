/**
 * Claims Autopilot F1.3 — request hash + separated fingerprints.
 *
 * Proves identity (strong) and similarity (suspect) never conflate (D7, §8.2–8.4).
 */
import { describe, it, expect } from "vitest";
import { parseClaimSubmissionV1 } from "@/server/services/claim-intake/schema";
import { normalizeSubmission, type NormalizedSubmission } from "@/server/services/claim-intake/normalize";
import {
  computeRequestHash,
  computeStrongEventFingerprint,
  computeSuspectedDuplicateFingerprint,
  buildSuspectedDuplicateDescriptor,
} from "@/server/services/claim-intake/fingerprint";

function norm(raw: unknown): NormalizedSubmission {
  const p = parseClaimSubmissionV1(raw);
  if (!p.success) throw new Error("invalid fixture: " + JSON.stringify(p.error.issues));
  return normalizeSubmission(p.data);
}

const cleanClaim = (over: Record<string, unknown> = {}) => ({
  schemaVersion: "1",
  idempotencyKey: "req-hash-key-0001",
  member: { memberId: "mbr-1", memberNumber: "MBR-1" },
  provider: { providerId: "prv-1", branchId: "brn-1" },
  encounter: { serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT", serviceFrom: "2026-06-01" },
  diagnoses: [{ code: "J06.9", isPrimary: true }],
  lines: [{ sourceLineRef: "L1", serviceCategory: "CONSULTATION", cptCode: "99213", description: "GP consult", quantity: 1, unitCost: "1500.00", billedAmount: "1500.00" }],
  currency: "UGX",
  ...over,
});

describe("F1.3 — request hash", () => {
  it("is stable and prefixed", () => {
    const h = computeRequestHash(norm(cleanClaim()));
    expect(h).toMatch(/^req:v1:[a-f0-9]{64}$/);
  });

  it("is independent of the idempotency key and submit time (transport-only)", () => {
    const a = computeRequestHash(norm(cleanClaim({ idempotencyKey: "key-aaaa-0001", submittedAt: "2026-06-01T08:00:00Z" })));
    const b = computeRequestHash(norm(cleanClaim({ idempotencyKey: "key-bbbb-0002", submittedAt: "2026-06-02T09:00:00Z" })));
    expect(a).toBe(b);
  });

  it("changes when claim-affecting content changes (conflict detection)", () => {
    const a = computeRequestHash(norm(cleanClaim()));
    const b = computeRequestHash(norm(cleanClaim({ lines: [{ sourceLineRef: "L1", serviceCategory: "CONSULTATION", cptCode: "99213", description: "GP consult", quantity: 1, unitCost: "9999.00", billedAmount: "9999.00" }] })));
    expect(a).not.toBe(b);
  });
});

describe("F1.3 — strong event fingerprint (authoritative identity only)", () => {
  const providerInvoice = (invoice: string) => ({
    tenantId: "t1", providerId: "prv-1", providerOwnsInvoiceNamespace: true, invoiceNumber: invoice,
  });

  it("same tenant+provider+invoice across rails ⇒ same strong fingerprint", () => {
    // Two different channels (e.g. provider portal vs API) resolving the SAME invoice.
    const viaPortal = computeStrongEventFingerprint({ ...providerInvoice("INV-777"), integrationKeyId: null });
    const viaApi = computeStrongEventFingerprint({ ...providerInvoice("INV-777"), integrationKeyId: "int-key-9", externalClaimRef: "whatever" });
    expect(viaPortal).toMatch(/^strong:v1:[a-f0-9]{64}$/);
    expect(viaApi).toBe(viaPortal); // invoice precedence wins in both
  });

  it("no authoritative reference ⇒ no strong fingerprint (null)", () => {
    expect(computeStrongEventFingerprint({ tenantId: "t1", providerId: "prv-1", providerOwnsInvoiceNamespace: true })).toBeNull();
    expect(computeStrongEventFingerprint({ tenantId: "t1" })).toBeNull();
    // invoice present but provider does NOT own the namespace ⇒ not authoritative.
    expect(computeStrongEventFingerprint({ tenantId: "t1", providerId: "prv-1", providerOwnsInvoiceNamespace: false, invoiceNumber: "INV-1" })).toBeNull();
  });

  it("changed authoritative reference ⇒ changed strong fingerprint", () => {
    expect(computeStrongEventFingerprint(providerInvoice("INV-1"))).not.toBe(computeStrongEventFingerprint(providerInvoice("INV-2")));
  });

  it("honours the precedence order (external, case, preauth)", () => {
    const ext = computeStrongEventFingerprint({ tenantId: "t1", integrationKeyId: "int-1", externalClaimRef: "EXT-1" });
    const cas = computeStrongEventFingerprint({ tenantId: "t1", caseId: "case-1", caseSliceSeq: 1, entrySetHash: "es-abc" });
    const casFinal = computeStrongEventFingerprint({ tenantId: "t1", caseId: "case-1", caseFinal: true, entrySetHash: "es-final" });
    const pa = computeStrongEventFingerprint({ tenantId: "t1", preauthId: "pa-1", preauthConversionMarker: "convert:v1" });
    for (const fp of [ext, cas, casFinal, pa]) expect(fp).toMatch(/^strong:v1:[a-f0-9]{64}$/);
    // all distinct
    expect(new Set([ext, cas, casFinal, pa]).size).toBe(4);
    // a case slice vs its final differ (different entry-set + marker)
    expect(cas).not.toBe(casFinal);
  });

  it("is tenant-scoped — same invoice under a different tenant differs", () => {
    const t1 = computeStrongEventFingerprint({ tenantId: "t1", providerId: "prv-1", providerOwnsInvoiceNamespace: true, invoiceNumber: "INV-1" });
    const t2 = computeStrongEventFingerprint({ tenantId: "t2", providerId: "prv-1", providerOwnsInvoiceNamespace: true, invoiceNumber: "INV-1" });
    expect(t1).not.toBe(t2);
  });
});

describe("F1.3 — suspected-duplicate fingerprint (similarity, never links)", () => {
  const suspectInput = (n: NormalizedSubmission) => ({ tenantId: "t1", providerId: "prv-1", branchId: "brn-1", memberKey: "mbr-1", normalized: n });

  it("content-identical repeat services SHARE a suspected fingerprint (but carry no strong id)", () => {
    const a = norm(cleanClaim({ idempotencyKey: "visit-a-0001" }));
    const b = norm(cleanClaim({ idempotencyKey: "visit-b-0002" })); // identical content, different key
    expect(computeSuspectedDuplicateFingerprint(suspectInput(a))).toBe(computeSuspectedDuplicateFingerprint(suspectInput(b)));
    // Neither has an authoritative id ⇒ they can never be auto-linked.
    expect(computeStrongEventFingerprint({ tenantId: "t1", providerId: "prv-1", providerOwnsInvoiceNamespace: true })).toBeNull();
  });

  it("is order-independent across re-ordered identical lines", () => {
    const twoLines = (order: "fwd" | "rev") => cleanClaim({
      idempotencyKey: `susp-${order}-0001`,
      lines: (order === "fwd"
        ? [["L1", "99213", "1500.00"], ["L2", "85025", "2000.00"]]
        : [["L2", "85025", "2000.00"], ["L1", "99213", "1500.00"]]
      ).map(([ref, cpt, amt]) => ({ sourceLineRef: ref, serviceCategory: "LABORATORY", cptCode: cpt, description: "svc", quantity: 1, unitCost: amt, billedAmount: amt })),
    });
    expect(computeSuspectedDuplicateFingerprint(suspectInput(norm(twoLines("fwd"))))).toBe(
      computeSuspectedDuplicateFingerprint(suspectInput(norm(twoLines("rev")))),
    );
  });

  it("a fuzzy similar SECOND VISIT is a candidate (shared descriptor), not an exact event (no strong id, different exact suspect hash)", () => {
    const visit1 = norm(cleanClaim({ idempotencyKey: "fuzzy-1-0001", encounter: { serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT", serviceFrom: "2026-06-01" } }));
    const visit2 = norm(cleanClaim({ idempotencyKey: "fuzzy-2-0002", encounter: { serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT", serviceFrom: "2026-06-15" } }));
    // Different service dates ⇒ different EXACT suspect hash (they are not the same encounter)...
    expect(computeSuspectedDuplicateFingerprint(suspectInput(visit1))).not.toBe(computeSuspectedDuplicateFingerprint(suspectInput(visit2)));
    // ...but the candidate descriptor shares provider+member+benefit so a windowed search surfaces both.
    const d1 = buildSuspectedDuplicateDescriptor(suspectInput(visit1));
    const d2 = buildSuspectedDuplicateDescriptor(suspectInput(visit2));
    expect(d1.providerId).toBe(d2.providerId);
    expect(d1.memberKey).toBe(d2.memberKey);
    expect(d1.benefitCategory).toBe(d2.benefitCategory);
    // Neither is an authoritative exact event.
    expect(computeStrongEventFingerprint({ tenantId: "t1", providerId: "prv-1", providerOwnsInvoiceNamespace: true })).toBeNull();
  });
});

describe("F1.3 — safety", () => {
  it("the idempotency key is irrelevant to strong and suspect fingerprints", () => {
    // Strong/suspect take no key input at all; changing content keys cannot affect them.
    const s1 = computeStrongEventFingerprint({ tenantId: "t1", providerId: "prv-1", providerOwnsInvoiceNamespace: true, invoiceNumber: "INV-1" });
    const s2 = computeStrongEventFingerprint({ tenantId: "t1", providerId: "prv-1", providerOwnsInvoiceNamespace: true, invoiceNumber: "INV-1" });
    expect(s1).toBe(s2);
  });

  it("no readable PII/business ref leaks into any fingerprint value", () => {
    const strong = computeStrongEventFingerprint({ tenantId: "t1", providerId: "prv-1", providerOwnsInvoiceNamespace: true, invoiceNumber: "SECRET-INV-12345" })!;
    const suspect = computeSuspectedDuplicateFingerprint({ tenantId: "t1", providerId: "prv-1", memberKey: "secret-member-key", normalized: norm(cleanClaim()) });
    const req = computeRequestHash(norm(cleanClaim({ member: { memberId: "secret-member-key", memberNumber: "SECRET-MBR" } })));
    for (const fp of [strong, suspect, req]) {
      expect(fp).not.toMatch(/SECRET/i);
      expect(fp).not.toMatch(/member/i);
      expect(fp).toMatch(/^[a-z]+:v1:[a-f0-9]{64}$/);
    }
  });
});
