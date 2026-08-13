import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * UAT-HF P03.05 — the identifier-in-URL sweep (DEF-057, DEF-079).
 *
 * Acceptance: "browser history, URL, server access log, analytics event, and
 * referrer contain no member/card number."
 *
 * The first pass moved the provider eligibility form off GET and recorded the
 * rest as unaudited: "Other surfaces that may carry identifiers in query
 * strings are not audited — a sweep belongs with P11.05." This is that sweep,
 * and a ratchet so a new one cannot appear unnoticed.
 *
 * A query string is not a private channel. It is written to the server access
 * log, kept in browser history, and sent in the `Referer` header to any
 * third-party the page later loads — three places nobody thinks of as a data
 * store, and none of which is covered by the audit trail.
 */

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

const SOURCES = walk("src");
const read = (p: string) => readFileSync(p, "utf8");

/**
 * Identifier-shaped names that must never be assembled into a URL a browser
 * navigates to or an internal `fetch` targets.
 *
 * `claimNumber` and `preauthNumber` are deliberately absent: they identify a
 * transaction rather than a person, and DEF-057/079 are about member and card
 * numbers. `phoneNumber`/`msisdn` are here because a phone number identifies a
 * household — DEC-07 already established that as sensitive.
 */
const IDENTIFIER_PARAMS = ["memberNumber", "nationalId", "idNumber", "cardNumber", "msisdn", "phoneNumber"];

describe("P03.05 no member identifier is assembled into an internal URL", () => {
  it("no client fetch puts an identifier in a query string", () => {
    const offenders: string[] = [];
    for (const file of SOURCES) {
      const src = read(file);
      for (const param of IDENTIFIER_PARAMS) {
        // `fetch("/api/...?memberNumber=" + x)` or a template literal form.
        const pattern = new RegExp(`fetch\\([^)]*[?&]${param}=`, "s");
        if (pattern.test(src)) offenders.push(`${file}: fetch with ?${param}=`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no router navigation puts an identifier in a query string", () => {
    const offenders: string[] = [];
    for (const file of SOURCES) {
      const src = read(file);
      for (const param of IDENTIFIER_PARAMS) {
        if (new RegExp(`router\\.(push|replace)\\([^)]*[?&]${param}=`, "s").test(src)) {
          offenders.push(`${file}: router navigation with ?${param}=`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the member search picker posts its term instead of putting it in the URL", () => {
    // What an operator types here is very often a member number — that is what
    // the picker is FOR — and the search is debounced, so a GET wrote a partial
    // member number to the access log on every keystroke.
    const picker = read("src/components/ui/MemberSearchPicker.tsx");
    expect(picker).not.toMatch(/members\/search\?q=/);
    expect(picker).toContain('method: "POST"');

    const route = read("src/app/api/admin/members/search/route.ts");
    expect(route).toContain("export async function POST");
    // The GET handler is gone, not merely unused: leaving it would keep the
    // leaking path reachable by anything that still remembers the old URL.
    expect(route).not.toMatch(/export async function GET/);
    expect(route).not.toContain('searchParams.get("q")');
  });

  it("the provider eligibility lookup is still off GET", () => {
    // The first pass's fix, pinned so it cannot quietly revert.
    const actions = read("src/app/provider/eligibility/actions.ts");
    expect(actions).toContain("formData.get");
  });
});

describe("P03.05 what this sweep does NOT cover", () => {
  /**
   * Recorded rather than silently passed. Each is a real query-string
   * identifier that this sweep leaves in place, with the reason.
   */
  it("the partner API v1 still takes memberNumber as a query parameter", () => {
    // Machine-to-machine, authenticated by API key, and the query shape is a
    // published contract with external integrators — changing it is a breaking
    // API change and a partner-notice exercise, not a code fix. It DOES put
    // member numbers in the access log, so it remains a live finding.
    const route = read("src/app/api/v1/eligibility/route.ts");
    expect(route).toContain('searchParams.get("memberNumber")');
  });

  it("the audit-log free-text filter still round-trips through the URL", () => {
    // `q` searches audit descriptions, which contain member names and numbers,
    // so an operator CAN put an identifier into browser history here. Moving it
    // off the URL means converting a server-rendered filtered page into an
    // action-driven one — a refactor that needs browser verification this
    // session could not perform. Left as a named finding rather than a
    // half-applied change.
    const filters = read("src/app/(admin)/settings/audit-log/AuditLogFilters.tsx");
    expect(filters).toContain('name="q"');
  });
});
