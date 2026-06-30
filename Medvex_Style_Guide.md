# Medvex — Style Guide

> Reference document for all Medvex digital builds (Medvex Insurance · Third
> Party Administrator, Uganda). Source of truth: the **Medvex Design Language**
> handoff. Token values here mirror `src/app/globals.css @theme` — if the two
> ever diverge, the CSS wins. Token *names* are deliberately neutral (`brand-*`)
> so a future rebrand only touches values, never class usages (§D / D-7).

---

## 0. Brand at a glance

- **Wordmark:** `MED✓EX` — the **V-mark** is a teal (`#06B9AB`) checkmark on a
  navy (`#000523`) rounded square: "a check that means approved." It doubles as
  the app icon / favicon / avatar.
- **Tagline lockup:** "INSURANCE · THIRD PARTY ADMINISTRATOR".
- **Marketing domain:** `medvex.co.ug` (emails `…@medvex.co.ug`).
- **Icons:** `public/icons/medvex-icon.svg` (rounded) and
  `public/icons/medvex-maskable.svg` (full-bleed, for PWA maskable).
- **Anchor rule:** **navy `#000523` is the brand identity** (logo, sidebar,
  dark cards, PWA `theme_color`, Tenant `primaryColor`); **ink `#0B1437` is the
  in-app UI primary** (buttons, headings, links, PDF/report headers).

---

## 1. Brand Colors

### Primary palette

| Role | Name | Hex | Where used | Token (`--color-…`) |
|---|---|---|---|---|
| **Primary · brand** | Navy | `#000523` | Logo, sidebar, cover/dark cards, PWA `theme_color`, Tenant `primaryColor` | `brand-navy` |
| Depth / hover | Navy 700 | `#142150` | Panels, depth, primary hover | `brand-navy-700`, `brand-indigo-hover` |
| **In-app primary** | Ink | `#0B1437` | Buttons, headings, links, PDF/report headers, `--foreground` | `brand-indigo`, `brand-text-heading` |
| **Accent · confirm** | Teal | `#06B9AB` | Confirmation, emphasis, accent CTAs, Tenant `accentColor` | `brand-teal` |
| Link / eyebrow | Teal dark | `#058A80` | Links/eyebrows on light, hover targets | `brand-secondary` |
| Soft surface | Teal tint | `#E4F7F5` | "In review" badge bg, soft surfaces | `brand-teal-tint` |
| **Human · sparing** | Coral | `#F2715A` | Warm accent, "denied" dot, Tenant `warmColor` | `brand-pink`, `brand-coral` |

### Neutral palette

| Role | Hex | Usage | Token |
|---|---|---|---|
| Heading / Ink | `#0B1437` | Headings, strong emphasis | `brand-text-heading` |
| Body text | `#41505E` | Paragraphs, descriptions | `brand-text-body` |
| Slate (muted) | `#5A6B7B` | Labels, captions | `brand-text-muted` |
| Surface | `#FFFFFF` | Cards, page background | `brand-bg` |
| Mist | `#EEF2F4` | App background, alt surfaces, PWA `background_color` | `brand-bg-alt` |
| Border | `#E2E8EC` | Card borders | `brand-border` |
| Border subtle | `#E6EDF0` | Subtle separators | `brand-border-subtle` |
| Divider | `#E1E7EA` | Horizontal rules | `brand-divider` |

### Functional / status colors

| State | Text | Dot | Background | Token (text) |
|---|---|---|---|---|
| Approved | `#0F8A5F` | `#16A37B` | `#E3F6EF` | `brand-success` = `#0F8A5F` |
| Pending | `#B07407` | `#E6A21A` | `#FBEFD6` | (badge literals) |
| In review | `#0B8077` | `#06B9AB` | `#E4F7F5` | `brand-info` = `#0B8077` |
| Denied | `#C04A39` | `#F2715A` | `#FBE7E3` | `brand-error` = `#C04A39` |
| WhatsApp | — | — | `#25D366` | `brand-whatsapp` |

### Color usage rules

- **Navy `#000523` anchors brand identity; ink `#0B1437` drives the UI.** Don't
  use navy for body buttons — that's ink's job; don't use ink for the logo.
- **Teal `#06B9AB` means "confirmed / approved."** It's the accent and the
  checkmark — use it for confirmation and emphasis, not as a large surface.
- **Coral `#F2715A` is sparing warmth** and the "denied" signal dot — an accent,
  never a primary surface.
- Body text is `#41505E`, labels/captions are slate `#5A6B7B` — not pure black.
- The palette is intentionally restrained: navy/ink + teal + neutrals, with
  coral warmth. Avoid introducing new brand hues.

---

## 2. Typography

| Role | Font | Weights | Loaded as |
|---|---|---|---|
| **Display / headings** | **Sora** | 400 / 600 / 700 / 800 | `next/font/google` → `--font-sora` → `--font-heading` |
| **Body / UI** | **Hanken Grotesk** | 400 / 500 / 600 / 700 | `next/font/google` → `--font-hanken` → `--font-body` / `--font-ui` |
| Mono | `ui-monospace` | — | system mono |

**Font CSS variables** (from `globals.css @theme`):

```css
--font-heading: var(--font-sora), "Poppins", system-ui, sans-serif;
--font-body:    var(--font-hanken), "Inter", "Helvetica Neue", sans-serif;
--font-ui:      var(--font-hanken), system-ui, sans-serif;
```

**Why these fonts:** Sora is a geometric display sans with a confident,
modern-fintech character — it gives Medvex authority for a payer/TPA brand.
Hanken Grotesk is a clean, highly legible humanist body face that holds up at
small sizes in dense ops screens, claims tables, and PDFs.

### Typography rules

- Headings are **Sora 700** by default; use 800 only for large display.
- Body and UI labels are **Hanken Grotesk**; headings inherit
  `--color-brand-text-heading` (ink), body inherits `--color-brand-text-body`.
- Sub-12px text: keep `letter-spacing: 0` (Windows ClearType blurs widened
  tracking — `globals.css` zeroes tracking utilities globally).
- `font-synthesis: none` — never fake bold/italic; load real weights.

---

## 3. Components

### Buttons

| Variant | Background | Text | Border | Radius |
|---|---|---|---|---|
| Primary | `brand-indigo` `#0B1437` | `#FFFFFF` | none | pill (`--radius-pill: 50px`) |
| Primary hover | `brand-indigo-hover` `#142150` | `#FFFFFF` | none | pill |
| Accent / confirm | `brand-teal` `#06B9AB` | ink/white | none | pill |
| Secondary | transparent | `brand-indigo` | 1–2px solid `brand-border` | pill |

- Buttons are **pill-shaped** (`--radius-pill: 50px`) — a distinctive Medvex cue.
- Font: Hanken Grotesk 600–700.
- Smooth color transition on hover.

### Cards

- Background `brand-bg` `#FFFFFF`; border `1px solid brand-border` `#E2E8EC`.
- Soft shadow (`~0 2px 8px rgba(0,0,0,0.05)`); padding 20–24px.
- Dark/cover cards use navy `#000523` with white text.

### Status badges

Use the §1 functional triplets (text / dot / bg). Example — "In review":
text `#0B8077`, dot `#06B9AB`, bg `#E4F7F5`.

### Navigation / sidebar

- Admin sidebar uses navy `#000523` (brand identity surface), white text/icons.
- Member nav is light (`brand-bg`) with ink links.

---

## 4. Light-only, medical-clean

Dark mode is intentionally **disabled** — the app keeps a white background even
under `prefers-color-scheme: dark` (see `globals.css`) to preserve a clean,
clinical, high-legibility surface for claims/finance work.

---

## 5. CSS Custom Properties (quick reference)

Mirror of `src/app/globals.css @theme` (values are Medvex; names are neutral
`brand-*`). Tailwind v4 reads these directly — no JS config.

```css
@theme {
  /* Primary = Ink navy (buttons, headings, links) */
  --color-brand-indigo: #0b1437;
  --color-brand-indigo-hover: #142150;
  /* Secondary = teal-dark signal */
  --color-brand-secondary: #058a80;
  /* Warm = Medvex coral (sparing) */
  --color-brand-pink: #f2715a;

  /* Brand core */
  --color-brand-navy: #000523;
  --color-brand-navy-700: #142150;
  --color-brand-teal: #06b9ab;
  --color-brand-teal-tint: #e4f7f5;
  --color-brand-coral: #f2715a;

  /* Neutrals */
  --color-brand-text-heading: #0b1437; /* Ink */
  --color-brand-text-body: #41505e;
  --color-brand-text-muted: #5a6b7b; /* Slate */
  --color-brand-bg: #ffffff;          /* Surface */
  --color-brand-bg-alt: #eef2f4;      /* Mist */
  --color-brand-border: #e2e8ec;
  --color-brand-border-subtle: #e6edf0;
  --color-brand-divider: #e1e7ea;

  /* Functional */
  --color-brand-success: #0f8a5f; /* Approved */
  --color-brand-error: #c04a39;   /* Denied */
  --color-brand-info: #0b8077;    /* In review */
  --color-brand-whatsapp: #25d366;

  /* Typography */
  --font-heading: var(--font-sora), "Poppins", system-ui, sans-serif;
  --font-body: var(--font-hanken), "Inter", "Helvetica Neue", sans-serif;
  --font-ui: var(--font-hanken), system-ui, sans-serif;

  /* Radii */
  --radius-pill: 50px;
}

:root {
  --background: #ffffff;
  --foreground: #0b1437; /* Ink */
}
```

---

_Derived from the Medvex Design Language handoff and `src/app/globals.css`.
Supersedes the legacy operator style guide (§D / D-9)._
