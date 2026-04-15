All projects
AiCare Health Platform
To create a platform that can be used for managing the health memberships that Avenue Hospital has

Type / for skills

You're now using extra usage ∙ Your session limit resets at 8:00 PM

Start a task in Cowork
Health insurance management platform for Avenue Hospital
Last message 18 minutes ago
Avenue healthcare style guide creation
Last message 3 hours ago
Memory
Only you
Project memory will show here after a few chats.

Instructions
Add instructions to tailor Claude’s responses

Files
1% of project capacity used

AVENUE_STYLE_GUIDE.md
254 lines

md

AVENUE_STYLE_GUIDE.md
9.27 KB •254 lines
•
Formatting may be inconsistent from source

# Avenue Healthcare — Style Guide

> Reference document for all Avenue Healthcare digital builds. Extracted directly from the live avenuehealthcare.com website (April 2026) via DOM inspection, supplemented with comparative healthcare brand analysis.

---

## 1. Brand Colors

### Primary Palette

| Role               | Name          | Hex       | RGB           | Usage                                                                |
| ------------------ | ------------- | --------- | ------------- | -------------------------------------------------------------------- |
| **Primary Indigo** | Avenue Indigo | `#292A83` | 41, 42, 131   | Nav links, buttons, footer background, section headers, CTAs         |
| **Accent Blue**    | Avenue Blue   | `#435BA1` | 67, 91, 161   | Hover states, secondary links, interactive highlights                |
| **Warm Pink**      | Mandys Pink   | `#F5C6B6` | 245, 198, 182 | Soft accent backgrounds, warmth elements, maternal/wellness sections |

### Neutral Palette

| Role          | Hex       | RGB           | Usage                                      |
| ------------- | --------- | ------------- | ------------------------------------------ |
| Near-Black    | `#212529` | 33, 37, 41    | Heading text, strong emphasis              |
| Body Grey     | `#848E9F` | 132, 142, 159 | Body text, descriptions, secondary content |
| Mid Grey      | `#6C757D` | 108, 117, 125 | Disabled states, muted UI                  |
| Border Light  | `#E7EBEF` | 231, 235, 239 | Card borders, dividers                     |
| Surface Grey  | `#E6E7E8` | 230, 231, 232 | Alternate section backgrounds              |
| Border Subtle | `#EEEEEE` | 238, 238, 238 | Subtle separators                          |
| Divider       | `#DCDCDC` | 220, 220, 220 | Horizontal rules, card borders             |
| White         | `#FFFFFF` | 255, 255, 255 | Page background, cards, nav background     |

### Functional Colors

| Role           | Hex       | Usage                                 |
| -------------- | --------- | ------------------------------------- |
| Success Green  | `#28A745` | Confirmation states, success messages |
| WhatsApp Green | `#25D366` | WhatsApp CTA button (floating)        |
| Error Red      | `#DC3545` | Error states, validation              |
| Info Blue      | `#17A2B8` | Informational badges                  |

### Color Usage Rules

- **Avenue Indigo `#292A83` is the dominant brand color.** It anchors the footer, primary buttons, and all key CTAs.
- Body text is the cool grey `#848E9F` — NOT black. This is a deliberate soft-contrast choice.
- Headings use near-black `#212529` for stronger hierarchy against the grey body.
- Mandys Pink `#F5C6B6` is used sparingly for warmth — it's an accent, not a primary surface.
- The nav is white with indigo text/links, creating a clean, clinical top bar.
- Avoid introducing new brand colors. The palette is intentionally restrained: indigo + grey + white with pink warmth.

---

## 2. Typography

### Font Stack

| Role            | Font          | Weights Used              | Fallback Stack                                      |
| --------------- | ------------- | ------------------------- | --------------------------------------------------- |
| **Headings**    | **Quicksand** | 700 (Bold)                | `'Quicksand', 'Nunito', 'Poppins', sans-serif`      |
| **Body**        | **Lato**      | 400 (Regular), 700 (Bold) | `'Lato', 'Open Sans', 'Helvetica Neue', sans-serif` |
| **UI / Accent** | **Roboto**    | 400, 500                  | `'Roboto', 'Lato', sans-serif`                      |

**Why these fonts**: Quicksand is a rounded geometric sans-serif — it gives Avenue a softer, more approachable feel than typical angular healthcare fonts. The rounded terminals convey warmth and friendliness, matching their community-focused positioning. Lato provides clean, highly readable body text with humanist proportions. Roboto appears in some UI elements as a supplementary font.

### Type Scale (observed from site)

| Level              | Size (desktop) | Weight | Font      | Color     |
| ------------------ | -------------- | ------ | --------- | --------- |
| H2 — Section Title | 42px           | 700    | Quicksand | `#000000` |
| H2 — Card Title    | 15px           | 700    | Quicksand | `#000000` |
| H3 — Subsection    | 20px           | 700    | Quicksand | `#000000` |
| Body               | 16px           | 400    | Lato      | `#848E9F` |
| Body Small         | 14px           | 400    | Lato      | `#848E9F` |
| Nav Links          | 14px           | 700    | Lato      | `#292A83` |
| Button             | 14–16px        | 700    | Lato      | `#FFFFFF` |

### Typography Rules

- Headings are always **Quicksand Bold (700)**. The rounded letterforms are core to the brand identity.
- Body text uses `#848E9F` — maintain this cool grey for all descriptive/paragraph text.
- Headings use `#000000` or `#212529` for contrast against the grey body.
- Nav and UI labels use Lato Bold in Avenue Indigo.
- Maximum line length: ~70ch for body text.
- All Google Fonts — load via: `Quicksand:wght@700` and `Lato:wght@400;700` and `Roboto:wght@400;500`.

---

## 3. Components

### Buttons

| Variant            | Background  | Text      | Border              | Radius          |
| ------------------ | ----------- | --------- | ------------------- | --------------- |
| **Primary (Pill)** | `#292A83`   | `#FFFFFF` | none                | **50px** (pill) |
| Primary Hover      | `#435BA1`   | `#FFFFFF` | none                | 50px            |
| Secondary          | transparent | `#292A83` | 2px solid `#292A83` | 50px            |
| WhatsApp Float     | `#25D366`   | `#FFFFFF` | none                | 50% (circle)    |

- **Key detail: Buttons are pill-shaped** (`border-radius: 50px`). This is a distinctive Avenue design choice — do not use squared or lightly-rounded buttons.
- Padding: ~12px 28px.
- Font: Lato 700, 14–16px.
- Transition: smooth color shift on hover.

### Cards

- Background: `#FFFFFF`
- Border: 1px solid `#EEEEEE` or `#E7EBEF`
- Border-radius: 8px
- Shadow: subtle, ~`0 2px 8px rgba(0, 0, 0, 0.05)`
- Padding: 20–24px

### Navigation

- Background: `#FFFFFF` (clean, white)
- Link color: `#292A83` (Avenue Indigo)
- Link weight: Lato 700
- Style: horizontal, clean, minimal — no background tints on nav items
- CTA button in nav: pill-shaped, indigo background

### Footer

- Background: `#292A83` (Avenue Indigo)
- Text: `#FFFFFF`
- Full-width, dark anchor block
- Links in white, subtle hover lightening

---

## 4. Spacing & Layout

### Spacing Scale (8px base)

| Token | Value | Usage                   |
| ----- | ----- | ----------------------- |
| `xs`  | 4px   | Inline icon gaps        |
| `sm`  | 8px   | Tight padding           |
| `md`  | 16px  | Card padding, form gaps |
| `lg`  | 24px  | Section inner padding   |
| `xl`  | 32px  | Between blocks          |
| `2xl` | 48px  | Section separators      |
| `3xl` | 64px  | Major section gaps      |
| `4xl` | 96px  | Hero vertical padding   |

### Grid

- Max container: ~1200px, centered.
- The site uses **Bootstrap** as its CSS framework.
- Breakpoints: `sm: 576px`, `md: 768px`, `lg: 992px`, `xl: 1200px`.

---

## 5. Iconography

- Site uses **IcoFont** and **Font Awesome 5** (Free + Brands).
- Style: filled and outlined mix.
- Icon color: typically `#292A83` or `#848E9F`.
- For new builds: Lucide or Phosphor are acceptable modern alternatives, keeping a rounded/friendly style to match Quicksand.

---

## 6. Photography & Imagery

- Warm, natural lighting preferred.
- Subjects reflect diverse Kenyan community.
- Hero sections use large carousel/slider images.
- Overlay treatments: dark gradients for text legibility on hero images.
- Images are generally full-width or contained in rounded cards.

---

## 7. Tone & Voice

- Warm, community-focused, accessible.
- Tagline: _"Delivering tomorrow's health care for your family."_
- Mission: _"We serve the community by improving the quality of life through better health."_
- CTAs are direct: "Book Appointment", "Download Profile", "Call Us."
- Avoid clinical jargon. Speak to families, not medical professionals.

---

## 8. Comparative Benchmarks

| Brand                        | Primary Color      | Heading Font  | Body Font | Key Takeaway                             |
| ---------------------------- | ------------------ | ------------- | --------- | ---------------------------------------- |
| **Avenue Healthcare**        | Indigo `#292A83`   | Quicksand     | Lato      | Rounded, warm, distinctive indigo anchor |
| Aga Khan University Hospital | Deep teal          | Custom serif  | Roboto    | Prestige + accessibility                 |
| MP Shah Hospital             | Blue + gold        | Montserrat    | Open Sans | Corporate Kenyan healthcare standard     |
| Nairobi Hospital             | Navy + orange      | Open Sans     | Open Sans | Strong corporate trust signals           |
| Healthcare.gov (US)          | Blue `#0071BC`     | Bitter (slab) | Open Sans | Dual-font hierarchy for warmth           |
| NHS (UK)                     | NHS Blue `#005EB8` | Frutiger      | Frutiger  | Maximum clarity, wayfinding-first        |

**Avenue's differentiation**: The indigo `#292A83` sits between blue and purple — unique in the Kenyan healthcare market where competitors lean toward pure blues or teals. Combined with Quicksand's rounded letterforms and the occasional Mandys Pink warmth, Avenue reads as more **friendly and family-oriented** than the clinical competition.

---

## 9. CSS Custom Properties (Quick Reference)

```css
:root {
  /* Brand Colors */
  --avenue-indigo: #292a83;
  --avenue-indigo-hover: #435ba1;
  --avenue-pink: #f5c6b6;

  /* Neutrals */
  --avenue-text-heading: #212529;
  --avenue-text-body: #848e9f;
  --avenue-text-muted: #6c757d;
  --avenue-bg: #ffffff;
  --avenue-bg-alt: #e6e7e8;
  --avenue-border: #eeeeee;
  --avenue-border-subtle: #e7ebef;
  --avenue-divider: #dcdcdc;

  /* Functional */
  --avenue-success: #28a745;
  --avenue-error: #dc3545;
  --avenue-info: #17a2b8;
  --avenue-whatsapp: #25d366;

  /* Typography */
  --font-heading: "Quicksand", "Nunito", "Poppins", sans-serif;
  --font-body: "Lato", "Open Sans", "Helvetica Neue", sans-serif;
  --font-ui: "Roboto", "Lato", sans-serif;

  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-2xl: 48px;
  --space-3xl: 64px;
  --space-4xl: 96px;

  /* Radii */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-pill: 50px;
  --radius-circle: 50%;

  /* Shadows */
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.04);
  --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.05);
  --shadow-lg: 0 4px 16px rgba(0, 0, 0, 0.08);

  /* Transitions */
  --transition-fast: 0.15s ease;
  --transition-base: 0.2s ease;
  --transition-slow: 0.3s ease-out;
}
```

---

_Extracted from live avenuehealthcare.com via DOM inspection, April 2026. Cross-referenced with Brandfetch brand profile and comparative healthcare analysis._
