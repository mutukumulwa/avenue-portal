/**
 * ELIG-GAP-020 — the provider-portal claim entitlement gate must resolve the
 * member entitlement-scoped ALWAYS, not only when the deny-by-default flag is on.
 * A provider can never file a claim for a member outside its contracted clients.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const entitlement = vi.hoisted(() => ({ entitledMemberWhere: vi.fn(async () => ({ group: { clientId: { in: ["c1"] } } })) }));
const settings = vi.hoisted(() => ({ isEntitlementEnforced: vi.fn(async () => false) })); // flag OFF

vi.mock("@/server/services/provider-entitlement.service", () => ({ ProviderEntitlementService: entitlement }));
vi.mock("@/server/services/provider-access-settings.service", () => ({ ProviderAccessSettingsService: settings }));

import { ProviderClaimEntitlementGate } from "@/server/services/provider-claim-entitlement-gate.service";

const svcDate = new Date("2026-08-11T00:00:00Z");

function dbWith(member: { id: string } | null) {
  return { member: { findFirst: vi.fn(async () => member) } } as never;
}

describe("ProviderClaimEntitlementGate.resolveSubmittableMember", () => {
  beforeEach(() => vi.clearAllMocks());

  it("entitlement-scopes the lookup even with the enforcement flag OFF (ELIG-GAP-020)", async () => {
    const db = dbWith({ id: "m1" });
    const res = await ProviderClaimEntitlementGate.resolveSubmittableMember(
      { tenantId: "t1", providerId: "pA", memberNumber: "M-1", serviceDate: svcDate }, db,
    );
    // The entitlement fragment is ALWAYS requested, at the claim's service date.
    expect(entitlement.entitledMemberWhere).toHaveBeenCalledWith("pA", svcDate);
    // ...and spread into the member lookup where-clause.
    const where = (db as unknown as { member: { findFirst: ReturnType<typeof vi.fn> } }).member.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId: "t1", group: { clientId: { in: ["c1"] } } });
    expect(res.member).toEqual({ id: "m1" });
  });

  it("returns member:null when the member is out of entitlement (deny-by-default)", async () => {
    const db = dbWith(null);
    const res = await ProviderClaimEntitlementGate.resolveSubmittableMember(
      { tenantId: "t1", providerId: "pA", memberNumber: "FOREIGN", serviceDate: svcDate }, db,
    );
    expect(entitlement.entitledMemberWhere).toHaveBeenCalled();
    expect(res.member).toBeNull();
  });
});
