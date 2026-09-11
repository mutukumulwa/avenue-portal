"use client";

import { Component, type ReactNode } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { LayoutDashboard, LogOut } from "lucide-react";
import { reportBoundaryError } from "@/components/errors/ErrorRecovery";
import { reportNavigationRenderErrorAction } from "@/app/provider/capture-actions";

const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal";

/**
 * Family Hospital UAT plan P06 / §9 — if the provider bar itself fails to render,
 * the page keeps a way home and a way out in the bar's place (the brand,
 * Dashboard and Logout), instead of losing all navigation or the whole page.
 * The failure is reported once: to the browser console like every other
 * boundary, and to the server as a structured `navigation_render_error` event
 * carrying the session's opaque ids and the error digest only.
 */
export class ProviderNavBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error & { digest?: string }): void {
    reportBoundaryError(error, "provider navigation");
    void reportNavigationRenderErrorAction({ digest: error.digest ?? null }).catch(() => undefined);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <header data-provider-shell="" className="sticky top-0 z-40 border-b border-[#EEEEEE] bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <Link href="/provider/dashboard" className={`flex shrink-0 items-center gap-2 rounded-lg ${FOCUS}`}>
            <span aria-hidden="true" className="h-7 w-7 rounded-full bg-brand-indigo" />
            <span className="font-heading text-lg font-bold text-brand-indigo">Medvex</span>
          </Link>
          <nav aria-label="Provider" className="min-w-0">
            <Link href="/provider/dashboard" className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-brand-text-body hover:bg-brand-bg-alt ${FOCUS}`}>
              <LayoutDashboard size={15} aria-hidden="true" />
              Dashboard
            </Link>
          </nav>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className={`ml-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-brand-error hover:bg-red-50 ${FOCUS}`}
          >
            <LogOut size={15} aria-hidden="true" />
            Logout
          </button>
        </div>
      </header>
    );
  }
}
