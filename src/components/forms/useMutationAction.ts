"use client";

/**
 * UAT-HF P01.01 — the client half of the mutation envelope.
 *
 * DEF-065, verbatim from the run: "any network interruption during a submit
 * crashes the client, destroys all typed input, never recovers on reconnect, and
 * can hide a write that committed (server returned 200 and created
 * UX26-2026-00037 while the operator saw only a crash)."
 *
 * Three separate failures in one sentence, and this hook answers all three:
 *
 *  1. **The crash.** A Server Action whose request never completes leaves
 *     `useActionState` with a REJECTED promise. React propagates that to the
 *     nearest error boundary and unmounts the form. Wrapping the action in
 *     try/catch keeps the rejection local and turns it into a rendered state.
 *  2. **The lost input.** The submitted `FormData` is snapshotted before the call,
 *     so the form can re-render with everything the user typed (DEF-071, DEF-008).
 *  3. **The hidden write.** A transport failure cannot distinguish "never arrived"
 *     from "committed, response lost", so it is reported as `UNKNOWN_OUTCOME` with
 *     a stable operation id to check against — never as a plain failure that
 *     invites a resubmit.
 *
 * The operation id is minted ONCE per mounted draft and resent on every attempt,
 * so a double-click or a retry is recognised server-side as a replay (DEF-034).
 */
import { useActionState, useCallback, useMemo, useRef } from "react";
import {
  OPERATION_ID_FIELD,
  isControlFlowError,
  mutationFail,
  type MutationResult,
} from "@/lib/mutation-contract";
import { newOperationId } from "@/lib/correlation";

export type MutationFormValues = Record<string, string>;

export type ServerMutation<T> = (
  previous: MutationResult<T> | null,
  formData: FormData,
) => Promise<MutationResult<T>>;

export interface UseMutationActionReturn<T> {
  /** The last result, or null before the first submit. */
  state: MutationResult<T> | null;
  /** Pass to `<form action={...}>`. */
  formAction: (formData: FormData) => void;
  pending: boolean;
  /** Everything the user last submitted, so inputs can be restored on failure. */
  values: MutationFormValues;
  /** This draft's operation id. Stable for the lifetime of the mounted form. */
  operationId: string;
}

/** Snapshot only string entries; a File has no meaningful value to restore. */
function snapshot(formData: FormData): MutationFormValues {
  const values: MutationFormValues = {};
  for (const [key, value] of formData.entries()) {
    if (key === OPERATION_ID_FIELD) continue;
    if (typeof value === "string") values[key] = value;
  }
  return values;
}

export function useMutationAction<T = void>(action: ServerMutation<T>): UseMutationActionReturn<T> {
  // One id per mounted draft. useMemo is not a cache guarantee, so it is pinned
  // into a ref on first render and never recomputed.
  const idRef = useRef<string | null>(null);
  const operationId = useMemo(() => {
    idRef.current ??= newOperationId();
    return idRef.current;
  }, []);

  const valuesRef = useRef<MutationFormValues>({});

  const guarded = useCallback(
    async (previous: MutationResult<T> | null, formData: FormData): Promise<MutationResult<T>> => {
      valuesRef.current = snapshot(formData);
      formData.set(OPERATION_ID_FIELD, operationId);

      try {
        return await action(previous, formData);
      } catch (err) {
        // redirect()/notFound() signal by throwing and MUST reach React.
        if (isControlFlowError(err)) throw err;

        // Anything else here is a transport-level failure: the request may or may
        // not have been processed. Never present this as "it failed".
        return mutationFail("UNKNOWN_OUTCOME", { operationId });
      }
    },
    [action, operationId],
  );

  const [state, formAction, pending] = useActionState<MutationResult<T> | null, FormData>(guarded, null);

  return { state, formAction, pending, values: valuesRef.current, operationId };
}
