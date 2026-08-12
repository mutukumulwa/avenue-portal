"use client";

/**
 * UAT-HF P01.06 — warn before discarding typed input.
 *
 * DEF-008: "Member registration form has no Cancel control; typed data discarded
 * with no unsaved-change warning." DEF-016: "No unsaved-change warning on any exit
 * path from the client creation form."
 *
 * Two different exits need two different mechanisms, and only having one is why
 * the run found data lost either way:
 *
 *   * leaving the TAB (close, reload, external link) — only `beforeunload` can
 *     intervene, and browsers deliberately ignore any custom message;
 *   * leaving IN-APP (Cancel, a nav link) — the app must ask, because a
 *     client-side route change never fires `beforeunload`.
 *
 * The guard is registered only while the form is actually dirty, so a user who
 * has typed nothing is never nagged.
 */
import { useCallback, useEffect } from "react";

export interface DirtyFormGuard {
  /**
   * Call before an in-app navigation. Returns true when it is safe to proceed —
   * either the form is clean, or the user accepted the loss.
   */
  confirmDiscard: (message?: string) => boolean;
}

export const DISCARD_MESSAGE = "You have unsaved changes. Leave without saving?";

export function useDirtyFormGuard(isDirty: boolean): DirtyFormGuard {
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      // preventDefault + returnValue is the contract browsers still honour; the
      // string itself is ignored by every modern browser, so we do not craft one.
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  const confirmDiscard = useCallback(
    (message: string = DISCARD_MESSAGE) => {
      if (!isDirty) return true;
      if (typeof window === "undefined") return true;
      return window.confirm(message);
    },
    [isDirty],
  );

  return { confirmDiscard };
}

/**
 * Whether anything in a form differs from where it started.
 *
 * Compares against the initial snapshot rather than tracking "has the user typed",
 * so typing a character and deleting it again leaves the form clean.
 */
export function isFormDirty(initial: Record<string, string>, current: Record<string, string>): boolean {
  const keys = new Set([...Object.keys(initial), ...Object.keys(current)]);
  for (const key of keys) {
    if ((initial[key] ?? "") !== (current[key] ?? "")) return true;
  }
  return false;
}
