# Role-Based Test Results — 2026-07-04

**Method:** headless Chrome sweep (`rb-sweep.mjs`) — per role: UI login, landing capture, 16 route probes, screenshot. Raw matrix: `rb-sweep-results.json`; screenshots: `04_Evidence/Screenshots/rb-<ROLE>.png`.
**Run note:** `.env`'s PUPPETEER_EXECUTABLE_PATH and puppeteer's cached Chrome are both broken on this machine; use system Chrome (`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`).

## Result matrix (✓ = accessible, ✗ = redirected)

| Route | ADMIN | CLAIMS | FINANCE | UW | CS | MEDICAL | REPORTS | FUND | BROKER | HR | MEMBER |
|---|---|---|---|---|---|---|---|---|---|---|---|
| /dashboard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| /members | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| /claims | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| /billing(+gl) | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| /settlement | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| /contracts | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| /clients, /providers, /settings | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| /reports, /analytics | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| /member/dashboard | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| /hr/dashboard | ✓ | →login* | →login* | →login* | →login* | →login* | →login* | →login* | →login* | ✓ | →login* |
| /broker/dashboard | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ |
| /fund/dashboard | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |

\* PR-019: HR guard redirects authenticated non-HR users to `/login` instead of `/unauthorized` (all other guards use /unauthorized).

## Conclusions
- Enforcement is **server-side** (probes were direct navigations, not menu clicks) and matches `src/lib/rbac.ts` role sets exactly.
- Landing routing per role correct (staff → /dashboard; fund/broker/hr/member → own portals).
- SUPER_ADMIN is excluded from the member portal by design; has HR/broker/fund access.
- Role-fidelity actions verified elsewhere: contract approve blocked for maker (PR-009 UX aside), settlement self-approve blocked with message, PA medical review done as MEDICAL_OFFICER, settlement maker as FINANCE_OFFICER.
- Not yet covered: record-level scoping probes (HR cross-employer IDOR, broker book isolation via ID-swap), fine-grained Role/Permission enforcement (OQ-1).
