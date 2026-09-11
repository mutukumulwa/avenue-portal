/**
 * Family Hospital UAT plan P01.03 / P02.03 — the shared tariff candidate set and
 * selection (src/server/services/contract-engine/tariff-selection.ts).
 *
 * The engine's own selection is the oracle. Everything the catalogue and the
 * preflight build on top of it (the O(1) index, the SELECTABLE / SHADOWED /
 * AMBIGUOUS verdicts) must agree with it exactly — including where the engine's
 * behaviour is surprising (first description match in candidate order, "<" and
 * ">" discarded by the normaliser). The Family fixtures below mirror real
 * collision classes found in the production preflight on 2026-09-11, with
 * invented ids.
 */
import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  candidateTariffWhere,
  normalizeServiceText,
  pricingTermsKey,
  selectTariffByCodeOrDescription,
  TariffResolutionIndex,
  type AnalysableTariff,
} from "@/server/services/contract-engine/tariff-selection";

const FROM = new Date("2026-08-28T00:00:00Z");

function row(id: string, over: Partial<AnalysableTariff> = {}): AnalysableTariff {
  return {
    id,
    cptCode: null,
    providerServiceCode: null,
    serviceName: `Service ${id}`,
    standardDescription: null,
    providerDescription: null,
    branchId: null,
    clientId: null,
    contractId: "con-1",
    tariffType: "NEGOTIATED",
    effectiveFrom: FROM,
    agreedRate: "1000",
    currency: "UGX",
    rateType: "FIXED",
    ...over,
  };
}

describe("candidateTariffWhere — the engine's scope, verbatim", () => {
  it("is contract-bound, active, effective on the pricing day, branch/client scoped", () => {
    const where = candidateTariffWhere({ contractId: "con-1", pricingDate: new Date(2026, 8, 11), providerBranchId: "br-1", clientId: "cl-1" });
    expect(where.contractId).toBe("con-1"); // never `null` — standalone rows are out
    expect(where.isActive).toBe(true);
    expect(where.AND).toEqual([
      { OR: [{ branchId: "br-1" }, { branchId: null }] },
      { OR: [{ clientId: "cl-1" }, { clientId: null }] },
    ]);
    const lte = (where.effectiveFrom as { lte: Date }).lte;
    expect([lte.getHours(), lte.getMinutes()]).toEqual([23, 59]); // PR-026 end-of-day
  });

  it("keeps the documented no-branch quirk: a claim without a branch sees every branch", () => {
    const where = candidateTariffWhere({ contractId: "con-1", pricingDate: FROM, providerBranchId: null });
    expect((where.AND as unknown[])[0]).toEqual({ OR: [{ branchId: undefined }, { branchId: null }] });
  });
});

describe("normalizeServiceText", () => {
  it("is the engine's normaliser — and it discards < and >", () => {
    expect(normalizeServiceText("Excision of Dermatosis papulosa nigra (>5 lesions)")).toBe(
      normalizeServiceText("Excision of Dermatosis papulosa nigra (<5 lesions)"),
    );
    expect(normalizeServiceText("  Ringers Lactate (Hartman'S Soln.) 500Ml ")).toBe("ringers lactate hartman s soln 500ml");
  });
});

describe("selectTariffByCodeOrDescription — engine stage 3 steps 1–2", () => {
  it("prefers a code match, branch-specific first", () => {
    const network = row("a", { cptCode: "99213" });
    const branch = row("b", { cptCode: "99213", branchId: "br-1" });
    expect(selectTariffByCodeOrDescription([network, branch], { cptCode: "99213", description: "x" })?.tariff.id).toBe("b");
  });

  it("takes the FIRST description match in candidate order, not the precedence winner", () => {
    const first = row("z-first", { serviceName: "Azithromycin 500Mg", agreedRate: "70000" });
    const second = row("a-second", { serviceName: "Azithromycin 500Mg", agreedRate: "4807" });
    const hit = selectTariffByCodeOrDescription([first, second], { description: "azithromycin 500mg" });
    expect(hit).toEqual({ tariff: first, method: "DESCRIPTION" });
  });

  it("matches on providerDescription and standardDescription as well as serviceName", () => {
    const t = row("p", { serviceName: "X", providerDescription: "Full Blood Count" });
    expect(selectTariffByCodeOrDescription([t], { description: "full blood count" })?.tariff.id).toBe("p");
  });

  it("returns null when nothing matches", () => {
    expect(selectTariffByCodeOrDescription([row("a")], { description: "nothing like it" })).toBeNull();
  });
});

describe("pricingTermsKey", () => {
  it("compares decimals by value, not by representation", () => {
    expect(pricingTermsKey(row("a", { agreedRate: new Prisma.Decimal("4807.000") }))).toBe(pricingTermsKey(row("b", { agreedRate: 4807 })));
    expect(pricingTermsKey(row("a", { agreedRate: "4807" }))).not.toBe(pricingTermsKey(row("b", { agreedRate: "70000" })));
  });

  it("treats a different unit price, currency, preauth flag or rate type as different terms", () => {
    const base = pricingTermsKey(row("a"));
    expect(pricingTermsKey(row("b", { currency: "KES" }))).not.toBe(base);
    expect(pricingTermsKey(row("b", { requiresPreauth: true }))).not.toBe(base);
    expect(pricingTermsKey(row("b", { rateType: "PER_DIEM" }))).not.toBe(base);
  });
});

// ─── The index must be the engine, only faster ───────────────────────────────

/** Small deterministic PRNG so a failure is reproducible from its seed. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("TariffResolutionIndex.select ≡ selectTariffByCodeOrDescription", () => {
  const NAMES = ["Full Blood Count", "full blood count!", "Malaria RDT", "Bed Fee – PRIVATE", "Bed Fee PRIVATE", "X-Ray Chest", "Consult"];
  const CODES = [null, null, null, "85025", "99213", "SER015"];

  for (let seed = 1; seed <= 200; seed += 1) {
    it(`agrees on random candidate set #${seed}`, () => {
      const rnd = mulberry32(seed);
      const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
      const tariffs: AnalysableTariff[] = Array.from({ length: 2 + Math.floor(rnd() * 12) }, (_, i) =>
        row(`t${String(i).padStart(2, "0")}-${seed}`, {
          serviceName: pick(NAMES),
          providerDescription: rnd() < 0.4 ? pick(NAMES) : null,
          standardDescription: rnd() < 0.2 ? pick(NAMES) : null,
          cptCode: pick(CODES),
          providerServiceCode: rnd() < 0.2 ? pick(["SER015", "SER016"]) : null,
          branchId: rnd() < 0.3 ? "br-1" : null,
          clientId: rnd() < 0.2 ? "cl-1" : null,
          tariffType: pick(["NEGOTIATED", "GAZETTED", "PUBLISHED"]),
          effectiveFrom: new Date(FROM.getTime() - Math.floor(rnd() * 5) * 86_400_000),
        }),
      );
      const index = new TariffResolutionIndex(tariffs);
      for (let probe = 0; probe < 25; probe += 1) {
        const line = {
          cptCode: rnd() < 0.5 ? pick(CODES) : null,
          providerServiceCode: rnd() < 0.2 ? pick(["SER015", "SER016", null]) : null,
          description: pick([...NAMES, "unlisted thing"]),
        };
        const oracle = selectTariffByCodeOrDescription(tariffs, line);
        const fast = index.select(line);
        expect(fast?.tariff.id ?? null).toBe(oracle?.tariff.id ?? null);
        expect(fast?.method ?? null).toBe(oracle?.method ?? null);
      }
    });
  }
});

// ─── Verdicts on the real Family collision classes (ids invented) ─────────────

describe("verdictMap — Family collision classes", () => {
  // Candidate order is effectiveFrom desc, id asc; all rows share effectiveFrom,
  // so id order decides — exactly as in production.
  const tariffs: AnalysableTariff[] = [
    row("a-dex-drugs", { serviceName: "Dextrose 5% 500Ml", agreedRate: "7590" }),
    row("b-dex-consumables", { serviceName: "Dextrose 5% 500Ml", agreedRate: "7590" }),
    row("c-azi-vial", { serviceName: "Azithromycin 500Mg", agreedRate: "70000" }),
    row("d-azi-tab", { serviceName: "Azithromycin 500Mg", agreedRate: "4807" }),
    row("e-dpn-more", { serviceName: "Excision of Dermatosis papulosa nigra (>5 lesions)", agreedRate: "500000" }),
    row("f-dpn-fewer", { serviceName: "Excision of Dermatosis papulosa nigra (<5 lesions)", agreedRate: "270000" }),
    row("g-unique", { serviceName: "General Doctor Consult", agreedRate: "25000" }),
  ];
  const v = new TariffResolutionIndex(tariffs).verdictMap();

  it("a same-price twin: the engine's row is selectable, the twin is shadowed", () => {
    expect(v.get("a-dex-drugs")?.status).toBe("SELECTABLE");
    expect(v.get("b-dex-consumables")).toMatchObject({ status: "SHADOWED", engineTariffId: "a-dex-drugs" });
  });

  it("different products that share a name are ambiguous — never priced by the first row", () => {
    expect(v.get("c-azi-vial")).toMatchObject({ status: "AMBIGUOUS", groupTariffIds: ["d-azi-tab"] });
    expect(v.get("d-azi-tab")).toMatchObject({ status: "SHADOWED", engineTariffId: "c-azi-vial" });
  });

  it("services that collide only in normalisation are ambiguous too", () => {
    expect(v.get("e-dpn-more")?.status).toBe("AMBIGUOUS");
    expect(v.get("f-dpn-fewer")?.status).toBe("SHADOWED");
  });

  it("a unique service is selectable and resolves to itself", () => {
    expect(v.get("g-unique")).toEqual({ tariffId: "g-unique", status: "SELECTABLE", engineTariffId: "g-unique", method: "DESCRIPTION", groupTariffIds: [] });
  });

  it("textKeyGroups catches a raw-text collision that distinct service names hide", () => {
    // Renaming the service is not enough if the raw providerDescription still
    // collides: an HMS line carrying the raw text would take the first row.
    const renamedOnly = [
      row("v", { serviceName: "Azithromycin 500Mg (Vial)", providerDescription: "Azithromycin 500Mg", agreedRate: "70000" }),
      row("w", { serviceName: "Azithromycin 500Mg (Tab)", providerDescription: "Azithromycin 500Mg", agreedRate: "4807" }),
    ];
    const index = new TariffResolutionIndex(renamedOnly);
    expect([...index.verdictMap().values()].map((x) => x.status)).toEqual(["SELECTABLE", "SELECTABLE"]); // portal-safe
    expect(index.textKeyGroups()).toEqual([{ key: "azithromycin 500mg", rows: renamedOnly, samePricing: false }]); // rail hazard
    expect(selectTariffByCodeOrDescription(renamedOnly, { description: "Azithromycin 500Mg" })?.tariff.id).toBe("v");

    const fullyRenamed = renamedOnly.map((r) => ({ ...r, providerDescription: r.serviceName }));
    expect(new TariffResolutionIndex(fullyRenamed).textKeyGroups()).toEqual([]);
  });

  it("two coded rows at different prices: the precedence winner is ambiguous, the loser shadowed", () => {
    const coded = [row("k1", { cptCode: "85025", agreedRate: "100" }), row("k2", { cptCode: "85025", agreedRate: "200" })];
    const cv = new TariffResolutionIndex(coded).verdictMap();
    expect(cv.get("k1")).toMatchObject({ status: "AMBIGUOUS", method: "CODE" });
    expect(cv.get("k2")).toMatchObject({ status: "SHADOWED", engineTariffId: "k1" });
  });
});
