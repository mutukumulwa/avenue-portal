"use client";

import { useState, useTransition } from "react";
import { FilePlus2, AlertCircle } from "lucide-react";
import { fileClaimFromPreauthAction } from "./actions";

export function FileClaimButton({ preAuthId }: { preAuthId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function go() {
    setError(null);
    start(async () => {
      const res = await fileClaimFromPreauthAction({ preAuthId });
      if (res?.error) setError(res.error);
      // success redirects server-side to the new claim
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        onClick={go}
        disabled={pending}
        className="flex items-center gap-1.5 rounded-full bg-brand-indigo px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-secondary disabled:opacity-60"
      >
        <FilePlus2 size={14} /> {pending ? "Starting…" : "File claim from this PA"}
      </button>
      {error && (
        <span className="flex items-center gap-1 text-xs text-[#DC3545]" role="alert">
          <AlertCircle size={13} /> {error}
        </span>
      )}
    </div>
  );
}
