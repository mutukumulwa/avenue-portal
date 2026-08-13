"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

/**
 * UAT-HF P11.02 — the mobile drawer, extracted (DEF-072, refines DEF-009).
 *
 * The admin shell got this behaviour first. The HR, fund and broker portals
 * kept the original `fixed w-60` sidebar with an unconditional `ml-60`/`ml-64`
 * on the content — so on the 360 px viewport the run tested, those three
 * portals still began 240–256 px in and had roughly 56 px of usable width
 * after padding. That is the measurement behind DEF-009's "five of six columns
 * including the row action" being unreachable.
 *
 * It is one component rather than three copies deliberately. The admin
 * implementation had two pieces of behaviour worth not re-deriving:
 *
 * **The drawer stores WHICH route it was opened for, not a boolean.** A
 * boolean needs an effect to reset it on navigation, and an effect that fails
 * to run leaves the destination page behind an opaque drawer — tapping a link
 * appears to do nothing, which is the DEF-069 class of "the control looks
 * broken" this branch has already fixed once. Comparing against the current
 * pathname closes it for free: there is no synchronisation to get wrong.
 *
 * **It starts closed and becomes permanent from `md` up.** `md:translate-x-0`
 * pins it open on tablet and desktop, so no portal loses its always-visible
 * navigation; only the phone width gets a drawer.
 *
 * Callers keep their own `<aside>` content. This owns the trigger, the
 * scrim, and the transform — nothing about what is inside the sidebar.
 */
export function SidebarDrawer({
  id,
  label,
  width,
  children,
}: {
  /** Referenced by the trigger's `aria-controls`; must be unique on the page. */
  id: string;
  /** Named in the trigger's accessible name, e.g. "HR menu". */
  label: string;
  /** Tailwind width class the portal's sidebar already uses. */
  width: "w-60" | "w-64";
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [openForPath, setOpenForPath] = useState<string | null>(null);
  const open = openForPath === pathname;

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpenForPath(open ? null : pathname)}
        className="fixed left-3 top-3 z-50 rounded-lg border border-[#EEEEEE] bg-white p-2 shadow-sm md:hidden"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        <span className="sr-only">{open ? `Close ${label}` : `Open ${label}`}</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setOpenForPath(null)}
          aria-hidden="true"
        />
      )}

      <aside
        id={id}
        className={`fixed left-0 top-0 z-40 h-screen ${width} border-r border-[#EEEEEE] bg-white transition-transform md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {children}
      </aside>
    </>
  );
}
