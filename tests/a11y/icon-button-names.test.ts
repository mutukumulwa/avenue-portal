/**
 * UAT-HF P09.04 / X-series acceptance — every icon-only control has an
 * accessible name (WCAG 2.2 SC 4.1.2 Name, Role, Value).
 *
 * DEF-056 (S3): "The remove controls in Provider Eligibility and Treatment
 * Exclusions render as `<button><svg class="lucide lucide-trash2"></svg></button>`
 * with innerText empty, aria-label null and title null. A screen reader announces
 * only 'button'. Voice control has no name to speak. The only disclosure of
 * intent is the native browser confirm that appears AFTER activation. This was
 * found by DOM inspection during P-005 and applies to at least two sections of
 * the package edit form."
 *
 * The run found two. A sweep of the source found **twenty-seven** across admin,
 * provider and shared components — so fixing the two named would have left the
 * defect in place almost everywhere it occurred. This test is the sweep, kept
 * executable so the next icon button cannot ship nameless.
 *
 * ## Why a source scan rather than a rendered-DOM check
 *
 * jsdom implements neither layout nor a full accessibility tree, and rendering
 * every one of these components would need a mock for each page's data. A source
 * scan answers the exact question DEF-056 asked — was the DOM inspected and found
 * to have `aria-label null and title null` — across every file at once, and it
 * cannot be satisfied by a component that merely happens not to be rendered in
 * any test.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Opening `<button …>` including multi-line attribute lists, JSX expressions and
 * quoted strings.
 *
 * `[^>"'{]` already matches a newline, so this needs no `s` flag — which this
 * tsconfig's target does not allow anyway.
 */
const BUTTON_OPEN =
  /<button\b((?:[^>"'{]|"[^"]*"|'[^']*'|\{(?:[^{}]|\{[^{}]*\})*\})*)>/g;

/** A self-closing element whose name starts with a capital — a lucide icon or similar. */
const SELF_CLOSING_COMPONENT = /<[A-Z]\w*\b[^>]*\/>/g;

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

interface Nameless {
  file: string;
  line: number;
  icon: string;
}

function findNamelessIconButtons(): Nameless[] {
  const found: Nameless[] = [];

  for (const file of tsxFiles("src")) {
    const src = readFileSync(file, "utf8");
    BUTTON_OPEN.lastIndex = 0;

    for (let m = BUTTON_OPEN.exec(src); m; m = BUTTON_OPEN.exec(src)) {
      const attrs = m[1];
      const close = src.indexOf("</button>", m.index + m[0].length);
      if (close === -1) continue;

      const body = src.slice(m.index + m[0].length, close);
      // A nested button means our slice spans two controls; the inner one is
      // matched on its own iteration.
      if (body.includes("<button")) continue;

      // Icon-only means: remove the icon elements and nothing is left. Any text,
      // any {expression} label, any child element keeps it out of scope.
      if (body.replace(SELF_CLOSING_COMPONENT, "").trim() !== "") continue;
      const icon = /<([A-Z]\w+)/.exec(body);
      if (!icon) continue;

      // The three ways to give a control a name.
      if (/aria-label|aria-labelledby|title=/.test(attrs)) continue;
      // A visually hidden text child would have failed the icon-only test above,
      // but check anyway so that pattern is explicitly allowed.
      if (body.includes("sr-only")) continue;

      found.push({
        file,
        line: src.slice(0, m.index).split("\n").length,
        icon: icon[1],
      });
    }
  }

  return found;
}

describe("DEF-056 — every icon-only button has an accessible name", () => {
  it("finds none anywhere under src/", () => {
    const nameless = findNamelessIconButtons();

    // The message matters more than the assertion: a future failure should say
    // exactly which control to fix, not just that a count changed.
    const report = nameless.map((n) => `  ${n.file}:${n.line}  <${n.icon}/>`).join("\n");
    expect(nameless, `Icon-only buttons with no accessible name:\n${report}`).toEqual([]);
  });

  it("the scanner actually detects one when it exists", () => {
    // A test that can only pass is worth nothing. This proves the detector fires
    // — otherwise a broken regex would report a clean codebase forever.
    const sample = `<button onClick={x} className="p-1"><Trash2 size={14} /></button>`;
    BUTTON_OPEN.lastIndex = 0;
    const m = BUTTON_OPEN.exec(sample);
    expect(m).not.toBeNull();
    expect(/aria-label|aria-labelledby|title=/.test(m![1])).toBe(false);

    const body = sample.slice(m!.index + m![0].length, sample.indexOf("</button>"));
    expect(body.replace(SELF_CLOSING_COMPONENT, "").trim()).toBe("");
  });

  it("does not flag a button that carries a text label", () => {
    const sample = `<button onClick={x}><Save size={14} /> Save changes</button>`;
    BUTTON_OPEN.lastIndex = 0;
    const m = BUTTON_OPEN.exec(sample)!;
    const body = sample.slice(m.index + m[0].length, sample.indexOf("</button>"));
    expect(body.replace(SELF_CLOSING_COMPONENT, "").trim()).not.toBe("");
  });
});

describe("DEF-056 — the two controls the run actually inspected", () => {
  it("Provider Eligibility names what it removes", () => {
    const src = readFileSync("src/app/(admin)/packages/[id]/edit/ProviderEligibilityManager.tsx", "utf8");
    expect(src).toMatch(/aria-label=\{`Remove rule:/);
  });

  it("Treatment Exclusions names what it removes", () => {
    const src = readFileSync("src/app/(admin)/packages/[id]/edit/TreatmentExclusionsManager.tsx", "utf8");
    expect(src).toMatch(/aria-label=\{`Remove .* treatment exclusion/);
  });

  it("neither name is a bare verb", () => {
    // "Delete" alone tells a voice-control user nothing about which row they are
    // about to destroy, which is the actual complaint.
    for (const f of [
      "src/app/(admin)/packages/[id]/edit/ProviderEligibilityManager.tsx",
      "src/app/(admin)/packages/[id]/edit/TreatmentExclusionsManager.tsx",
    ]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/aria-label="(Delete|Remove|Close)"/);
    }
  });
});
