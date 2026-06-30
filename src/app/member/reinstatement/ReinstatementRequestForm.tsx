"use client";

import { useActionState } from "react";
import { requestReinstatementAction } from "./actions";

export function ReinstatementRequestForm() {
  const [state, action, pending] = useActionState(requestReinstatementAction, null);

  if (state?.success) {
    return (
      <div className="p-4 bg-[#28A745]/10 border border-[#28A745]/20 rounded-lg text-sm text-[#28A745] font-semibold">
        Request submitted. Your administrator will review it shortly.
      </div>
    );
  }

  return (
    <form action={action}>
      {state?.error && (
        <p className="mb-3 text-sm text-[#DC3545] font-semibold">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full bg-brand-indigo text-white py-2.5 rounded-full font-bold text-sm hover:bg-blue-800 transition-colors disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Submit Reinstatement Request"}
      </button>
    </form>
  );
}
