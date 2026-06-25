# Unresolved — Visual / Browser / Device matrix (incl. Windows)

**Status: NOT TESTED.** No rendering environment was available in this run (no dev server, no connected browser). Per the plan, the following remain fully pending and must be executed before client use:

- **Windows font rendering (stated priority §5/§6)** — Geist/brand font load, no fallback flash, diacritics, weight/anti-aliasing vs macOS, side-by-side dashboard + data table. **No Windows machine available; no rendering at all.**
- Cross-browser smoke (Chrome/Edge/Firefox/Safari) — login per role + one core workflow each.
- Responsive widths: 390 / 768–1024 / 1366–1440 / 1920+ — no horizontal overflow; admin tables usable on tablet.
- Modals/dropdowns (focus trap, click-outside, z-index, viewport positioning).
- Tables (sticky headers, pagination, sorting, long-text overflow/ellipsis, KES-millions).
- Forms in validation-error state (visible, field-associated, not color-only, no layout shift).
- Empty / loading / pending-button states (tied to double-submit defects DEFECT-003/007).
- Print/PDF/export layouts (letters, quotation, debit note, board pack, statements, report PDFs, CSV).
- Dark/light mode (confirm whether `TenantThemeInjector` enables it).
- Accessibility (keyboard nav, focus rings, AA contrast, labels, alt text, focus return on modal close).
- Network throttling (Slow 3G spinners, no duplicate submits), offline/PWA degradation.

Inferred-from-HTML-only (not visual QA, recorded in [../visual_ui/VIS01_unauthenticated_pages.md](../visual_ui/VIS01_unauthenticated_pages.md)): unbranded default 404 (DEFECT-018) and missing `/seed-docs` documents (DEFECT-017).
