"use client";

/**
 * UAT-HF P04.02 — keep a draft while the operator types, and restore it only
 * when asked (DEF-071, DEF-008, DEF-016).
 *
 * Restoring is **explicit**. Silently repopulating a form is its own defect: the
 * operator cannot tell typed input from remembered input, and a stale draft
 * quietly becomes this enrolment. So the hook surfaces the draft and its
 * timestamp, and does nothing until someone chooses.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { DraftStore, type DraftScope, type DraftSpec, type StoredDraft } from "@/lib/draft-store";

/** How long typing must pause before a draft is written. */
export const DRAFT_SAVE_DEBOUNCE_MS = 800;

export interface FormDraft {
  /** A draft found on mount, awaiting an explicit decision. Null once decided. */
  offered: StoredDraft | null;
  /** When the live draft was last written, for the "saved at" indicator. */
  savedAt: string | null;
  /** Accept the offered draft; returns its values for the caller to apply. */
  restore: () => Record<string, string> | null;
  /** Refuse the offered draft and delete it. */
  discard: () => void;
  /** Record current form values (debounced). */
  capture: (values: Record<string, unknown>) => void;
  /** Delete the draft — call on a successful submit. */
  clear: () => void;
}

export function useFormDraft(scope: DraftScope | null, spec: DraftSpec): FormDraft {
  const [offered, setOffered] = useState<StoredDraft | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const tenantId = scope?.tenantId ?? "";
  const userId = scope?.userId ?? "";

  // Look for a draft once, on mount.
  //
  // `react-hooks/set-state-in-effect` is disabled here deliberately, and this is
  // the one shape where it should be. The alternatives are both worse:
  //
  //   * lazy `useState(() => DraftStore.load(...))` reads during render, which
  //     the server cannot do — sessionStorage does not exist there — so the
  //     server renders no banner, the client renders one, and hydration
  //     mismatches;
  //   * `useSyncExternalStore` needs a referentially stable snapshot, and
  //     re-reading storage as the operator types would offer them back the very
  //     draft they are in the middle of typing.
  //
  // This must happen exactly once per scope, after mount, and never again.
  useEffect(() => {
    if (!tenantId || !userId) return;
    const found = DraftStore.load({ tenantId, userId }, spec);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    if (found) setOffered(found);
  }, [tenantId, userId, spec]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const capture = useCallback(
    (values: Record<string, unknown>) => {
      if (!tenantId || !userId) return;
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        const draft = DraftStore.save({ tenantId, userId }, spec, values);
        setSavedAt(draft?.savedAt ?? null);
      }, DRAFT_SAVE_DEBOUNCE_MS);
    },
    [tenantId, userId, spec],
  );

  const restore = useCallback(() => {
    if (!offered) return null;
    setOffered(null);
    setSavedAt(offered.savedAt);
    return offered.values;
  }, [offered]);

  const discard = useCallback(() => {
    setOffered(null);
    setSavedAt(null);
    if (tenantId && userId) DraftStore.clear({ tenantId, userId }, spec);
  }, [tenantId, userId, spec]);

  const clear = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setOffered(null);
    setSavedAt(null);
    if (tenantId && userId) DraftStore.clear({ tenantId, userId }, spec);
  }, [tenantId, userId, spec]);

  return { offered, savedAt, restore, discard, capture, clear };
}

/** Read a form's current values without depending on controlled inputs. */
export function readFormValues(form: HTMLFormElement): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of new FormData(form).entries()) {
    if (typeof value === "string") values[key] = value;
  }
  return values;
}
