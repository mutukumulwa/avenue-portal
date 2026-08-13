/**
 * UAT-HF P03.05 — the member number must never travel in a URL, and the example
 * must never be a live client's numbering scheme.
 *
 * DEF-079: the check was `<form method="GET">`, so every number anyone typed
 * went into the query string — and therefore into the browser history of a
 * SHARED front-desk machine, the server access log, and the `Referer` header of
 * every link the page then rendered.
 *
 * DEF-057: the field was pre-filled with "e.g. NWSC-2026-00001", disclosing to
 * every provider on the network that NWSC is a client and exactly how its member
 * numbers are formed — a starting point for guessing valid ones.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Read a source file with comments stripped. These assertions are about what the
 * code DOES, and the files deliberately quote the old behaviour in their
 * explanatory comments — matching those would be a false positive.
 */
function sourceWithoutComments(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

const ctx = vi.hoisted(() => ({
  value: { providerId: "prov-1", tenantId: "t1", permissions: ["provider.eligibility.read"] } as Record<string, unknown>,
}));
vi.mock("@/server/services/provider-access.service", () => ({
  ProviderAccessService: { resolveUserContext: async () => ({ ctx: ctx.value }) },
}));
vi.mock("@/components/layouts/provider-nav-model", () => ({
  providerPermits: (permissions: string[], code: string) => permissions.includes(code),
}));

const check = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/provider-eligibility.service", () => ({
  ProviderEligibilityService: { check },
}));

import { checkEligibilityAction } from "@/app/provider/eligibility/actions";
// A "use server" file may export only async functions, so the constants moved
// to `contract.ts` — the arrangement that broke the production build while
// tsc, ESLint and Vitest all passed.
import { BENEFIT_OPTIONS, EMPTY_ELIGIBILITY_STATE } from "@/app/provider/eligibility/contract";
// The collapsed not-found copy at its source (P03.02).
import { COLLAPSED_NOT_FOUND_MESSAGE as NOT_FOUND_MESSAGE } from "@/server/services/eligibility/decision-contract";
import { EXAMPLES } from "@/lib/locale-config";

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

const run = (fields: Record<string, string>) => checkEligibilityAction(EMPTY_ELIGIBILITY_STATE, form(fields));

beforeEach(() => {
  vi.clearAllMocks();
  ctx.value = { providerId: "prov-1", tenantId: "t1", permissions: ["provider.eligibility.read"] };
  check.mockResolvedValue({ found: false, resultCode: "NOT_ELIGIBLE", safeExplanation: "", disclaimer: "d" });
});

describe("P03.05 the number posts, it does not navigate (DEF-079)", () => {
  it("the page no longer reads a member number from searchParams", () => {
    const page = sourceWithoutComments("src/app/provider/eligibility/page.tsx");
    // A GET form is what put the identifier in the URL, history and Referer.
    expect(page).not.toContain('method="GET"');
    expect(page).not.toMatch(/searchParams/);
  });

  it("the form submits through a Server Action", () => {
    const formFile = sourceWithoutComments("src/app/provider/eligibility/EligibilityCheckForm.tsx");
    expect(formFile).toContain("action={formAction}");
    expect(formFile).not.toContain('method="GET"');
  });

  it("does not echo the raw input back in the not-found message", async () => {
    // The run noted the old message "echoes the raw input unnormalised", which
    // both reflects unvalidated text and confirms on a shared screen what was tried.
    const state = await run({ q: "NWSC-2026-00001" });
    expect(state.result?.found).toBe(false);
    expect(NOT_FOUND_MESSAGE).not.toContain("NWSC-2026-00001");
    expect(NOT_FOUND_MESSAGE).not.toMatch(/\{|\}|“|”/);
  });
});

describe("P03.05 the worked example is illustrative, not live (DEF-057)", () => {
  it("no longer discloses a real client's numbering scheme", () => {
    const formFile = sourceWithoutComments("src/app/provider/eligibility/EligibilityCheckForm.tsx");
    expect(formFile).not.toContain("NWSC-2026-00001");
    expect(formFile).toContain("EXAMPLES.memberNumber");
  });

  it("the shared example itself names no real client", () => {
    expect(EXAMPLES.memberNumber).not.toMatch(/NWSC|UX26|Kyoga|Pearl/i);
  });
});

describe("P03.05 input safety survived the move to an action", () => {
  it.each([
    ["", /Enter the member or card number/],
    ["x".repeat(65), /too long/],
    ["Amina Nabirye", /not a name/],
    // An ESCAPED control character. It was previously a literal U+0001, which
    // is invisible in an editor and reads as the harmless word "badchar".
    ["bad\u0001char", /aren't allowed/],
  ])("rejects %s without running a lookup", async (q, pattern) => {
    const state = await run({ q });
    expect(state.inputError).toMatch(pattern);
    expect(check).not.toHaveBeenCalled();
  });

  it("rejects an invalid service date and an off-list benefit", async () => {
    expect((await run({ q: "ABC-1", serviceDate: "not-a-date" })).inputError).toMatch(/valid service date/);
    expect((await run({ q: "ABC-1", benefit: "SOMETHING_ELSE" })).inputError).toMatch(/Select a benefit/);
    expect(check).not.toHaveBeenCalled();
  });

  it("enforces the permission server-side, whatever the page rendered", async () => {
    ctx.value = { providerId: "prov-1", tenantId: "t1", permissions: [] };
    const state = await run({ q: "ABC-1" });
    expect(state.inputError).toMatch(/do not have permission/i);
    expect(check).not.toHaveBeenCalled();
  });

  it("runs the lookup for clean input, passing the allow-listed benefit", async () => {
    await run({ q: "ABC-2026-00001", benefit: BENEFIT_OPTIONS[0], serviceDate: "2026-08-11" });
    expect(check).toHaveBeenCalledTimes(1);
    expect(check.mock.calls[0][0]).toMatchObject({ memberNumber: "ABC-2026-00001", benefitCategory: "OUTPATIENT" });
  });
});

describe("P03.05 an outage is not an ineligibility (P03.02)", () => {
  it("reports unavailable rather than 'not eligible' when the service throws", async () => {
    check.mockRejectedValue(new Error("db down"));
    const state = await run({ q: "ABC-2026-00001" });
    // DEF-053: an outage was indistinguishable from a refusal of cover.
    expect(state.unavailable).toBe(true);
    expect(state.result).toBeNull();
    expect(state.inputError).toBeNull();
  });

  it("the form tells the operator it is not a refusal", () => {
    const formFile = readFileSync("src/app/provider/eligibility/EligibilityCheckForm.tsx", "utf8");
    expect(formFile).toMatch(/not<\/strong> a refusal of cover/);
  });
});
