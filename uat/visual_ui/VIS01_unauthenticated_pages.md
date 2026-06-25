# VIS01 — Visual / UI checks (SEVERELY LIMITED — no renderer in this environment)

> **Hard limitation.** No browser/renderer was available (no Node dev server; no connected Chrome MCP; desktop browsers are read-only tier). **No pixels were rendered and no screenshots were captured in this run.** The full visual matrix (plan §5/§6 — fonts, alignment, overflow, modals, tables, responsive, dark mode, **Windows font rendering**, accessibility) is therefore **NOT TESTED**. This is recorded as a major untested area in [../04_READINESS_SUMMARY.md](../04_READINESS_SUMMARY.md).

What could be inferred from raw HTML/headers only (not a substitute for visual QA):

## 404 page branding (DEFECT-018)
`GET /this-route-does-not-exist-uat-xyz` → **HTTP 404**. The body contains **two `<title>` tags**:
- `<title>404: This page could not be found.</title>` ← Next.js **default** 404 message
- `<title>AiCare Platform - Avenue Healthcare</title>` ← app layout chrome

I.e. the **unstyled default Next.js 404 text** renders inside the branded app shell. There is no custom `not-found.tsx`. **Confirms DEFECT-018** (unbranded 404; needs a branded not-found page with navigation). Severity **Low**.
Evidence: `../evidence/network_logs/GET_404.body.html`.

## Missing static documents (DEFECT-017)
`GET /seed-docs/welcome-letter.pdf` → **404**. `public/seed-docs/` does **not exist** in source (`public/` contains only icons, manifest, svgs, `member-import-template.csv`). The prior run recorded that seeded member documents link to `/seed-docs/{Safaricom_Benefit_Schedule_2025,Avenue_Member_Benefit_Guide_2025,Safaricom_Group_Contract_2024}.pdf`, all 404. The absence of the directory in source corroborates **DEFECT-017** (members cannot open plan documents). *Note: a 404 on a guessed filename is only supporting evidence; the exact linked filenames 404'ing was confirmed by the prior UI run.*

## NOT tested (needs a browser)
Login form rendering & validation states · all dashboards/tables/modals/dropdowns · QR member card · Leaflet provider map · KPI tiles & alignment · text overflow (long names, KES millions) · empty/loading/pending states (tied to double-submit defects) · responsive 390/768/1366/1920 · **Windows font rendering (explicit plan priority)** · dark/light mode · keyboard nav, focus rings, contrast, alt text · all print/PDF/export layouts.

➡️ **Windows visual checks are PENDING/UNRESOLVED** (no Windows machine, and in fact no rendering at all). See [../unresolved_questions/UQ_visual_and_browser_matrix.md](../unresolved_questions/UQ_visual_and_browser_matrix.md).
