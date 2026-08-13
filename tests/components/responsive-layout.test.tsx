/**
 * UAT-HF P11.02 — DEF-072 (S2).
 *
 * "The member register table is 870px wide inside a wrapper carrying class
 * 'overflow-x-auto', but the wrapper measures scrollWidth 870 and clientWidth
 * 870 — it is exactly as wide as its content, so the overflow container never
 * engages ... Member No., Group, Relationship, Status and the Actions cell
 * containing 'Profile' cannot be brought into view."
 *
 * The mechanism is a flex item's default `min-width: auto`, which refuses to
 * shrink below its content — so the wrapper grows to the table's width and
 * never becomes a scroll port. `min-w-0` is the whole fix, and it has to be on
 * BOTH the wrapper and its flex ancestor.
 *
 * jsdom has no layout engine, so scrollWidth/clientWidth cannot be measured
 * here. These assert the classes that produce the behaviour, on the real files.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(p, "utf8");

describe("P11.02 the scroll port can be narrower than its content", () => {
  it("the admin shell lets its content shrink", () => {
    const layout = read("src/app/(admin)/layout.tsx");
    expect(layout).toMatch(/min-w-0[^"]*flex-1|flex-1[^"]*min-w-0/);
  });

  it("the member register's table wrapper can shrink too", () => {
    const page = read("src/app/(admin)/members/page.tsx");
    expect(page).toContain("min-w-0 max-w-full overflow-x-auto");
  });

  it("the register card no longer clips instead of scrolling", () => {
    // `overflow-hidden` on the card would hide the columns rather than let the
    // port scroll them into view.
    const page = read("src/app/(admin)/members/page.tsx");
    const card = page.slice(page.indexOf("min-w-0 bg-white"), page.indexOf("overflow-x-auto"));
    expect(card).not.toContain("overflow-hidden");
  });

  it("every overflow-x-auto wrapper in the app carries min-w-0", () => {
    // One bare wrapper is one more table with unreachable columns. This is the
    // ratchet: the class pair travels together or the defect comes back.
    const offenders: string[] = [];
    for (const file of walk("src")) {
      if (!/\.tsx$/.test(file)) continue;
      const source = read(file);
      // A wrapper is bare when "overflow-x-auto" appears in a className that
      // does not also contain min-w-0.
      for (const match of source.matchAll(/className="([^"]*overflow-x-auto[^"]*)"/g)) {
        if (!match[1].includes("min-w-0")) offenders.push(`${file}: ${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the other portal shells can shrink as well", () => {
    for (const shell of [
      "src/app/(hr)/layout.tsx",
      "src/app/fund/layout.tsx",
      "src/app/broker/layout.tsx",
    ]) {
      expect(read(shell), shell).toContain("min-w-0 flex-1");
    }
  });
});

describe("P11.02 the admin shell gives a phone its screen", () => {
  const layout = read("src/app/(admin)/layout.tsx");
  const sidebar = read("src/components/layouts/AdminSidebar.tsx");

  it("no longer reserves 240px of a 360px viewport unconditionally", () => {
    // `ml-60` at every width left ~56px of usable content after padding, which
    // is why fixing the scroll alone would not have helped.
    expect(layout).toContain("md:ml-60");
    expect(layout).not.toMatch(/className="[^"]*\sml-60/);
  });

  it("uses smaller padding on small screens", () => {
    expect(layout).toMatch(/className="[^"]*\bp-4\b[^"]*\bmd:p-8\b/);
  });

  it("the sidebar is a drawer below md and permanent above it", () => {
    expect(sidebar).toContain("md:translate-x-0");
    expect(sidebar).toContain("-translate-x-full");
  });

  it("has a labelled toggle wired to the drawer", () => {
    expect(sidebar).toContain('aria-controls="admin-sidebar"');
    expect(sidebar).toContain("aria-expanded={mobileOpen}");
    expect(sidebar).toMatch(/sr-only.*(Open|Close) menu|\{mobileOpen \? "Close menu" : "Open menu"\}/);
  });

  it("starts closed, so it never covers a phone screen on load", () => {
    expect(sidebar).toContain("useState<string | null>(null)");
  });

  it("closes on navigation by construction, not by an effect", () => {
    // Storing WHICH route it was opened for means navigation closes it for
    // free; a boolean plus a resetting effect is a synchronisation to get wrong.
    expect(sidebar).toContain("const mobileOpen = openForPath === pathname;");
  });

  it("the toggle is hidden once the sidebar is permanent", () => {
    expect(sidebar).toMatch(/md:hidden/);
  });
});

describe("P11.02 the HR, fund and broker portals get the same treatment", () => {
  /**
   * The task's own recorded gap: "Only the admin shell got the drawer: the HR,
   * fund and broker portals have the same unconditional `ml-60`/`ml-64` and
   * each needs its own sidebar converting."
   *
   * Those three portals were still reserving 240–256 px of a 360 px viewport,
   * which is the measurement behind DEF-009 — so DEF-072 was fixed on one
   * surface out of four.
   */
  const PORTALS = [
    { name: "HR", layout: "src/app/(hr)/layout.tsx", sidebar: "src/components/layouts/HRSidebar.tsx", offset: "md:ml-60", id: "hr-sidebar" },
    { name: "fund", layout: "src/app/fund/layout.tsx", sidebar: "src/components/layouts/FundSidebar.tsx", offset: "md:ml-64", id: "fund-sidebar" },
    { name: "broker", layout: "src/app/broker/layout.tsx", sidebar: "src/components/layouts/BrokerSidebar.tsx", offset: "md:ml-64", id: "broker-sidebar" },
  ];

  for (const portal of PORTALS) {
    it(`${portal.name}: the sidebar offset is conditional, not unconditional`, () => {
      const layout = read(portal.layout);
      expect(layout).toContain(portal.offset);
      // The bare form is what caused the defect. Freeing the width with a
      // drawer and then taking it straight back with `ml-64` would fix nothing.
      expect(layout).not.toMatch(/className="[^"]*\sml-6[04]\b/);
    });

    it(`${portal.name}: small screens get smaller padding`, () => {
      expect(read(portal.layout)).toMatch(/className="[^"]*\bp-4\b[^"]*\bmd:p-8\b/);
    });

    it(`${portal.name}: the sidebar is a drawer, sharing one implementation`, () => {
      const sidebar = read(portal.sidebar);
      expect(sidebar).toContain("SidebarDrawer");
      expect(sidebar).toContain(`id="${portal.id}"`);
      // Three hand-rolled copies would be three chances to reintroduce the
      // boolean-plus-effect drawer that leaves the destination page covered.
      expect(sidebar).not.toContain("md:translate-x-0");
    });
  }
});

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}
