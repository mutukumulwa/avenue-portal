"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, AlertCircle } from "lucide-react";
import { submitInfoResponseAction } from "@/app/provider/preauth/[id]/info-request-actions";

export function RespondForm({ infoRequestId }: { infoRequestId: string }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function submit() {
    setError(null);
    start(async () => {
      const res = await submitInfoResponseAction({ infoRequestId, responseNote: note });
      if (res?.error) {
        setError(res.error);
        return;
      }
      setNote("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-start gap-2 text-sm text-[#DC3545]" role="alert">
          <AlertCircle size={15} className="mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}
      <textarea
        className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-indigo min-h-[110px]"
        placeholder="Describe the information you are providing (attach documents to the pre-authorization as needed)."
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex justify-end">
        <button
          onClick={submit}
          disabled={pending || note.trim().length === 0}
          className="flex items-center gap-1.5 rounded-full bg-brand-indigo px-5 py-2 text-sm font-semibold text-white hover:bg-brand-secondary disabled:opacity-60"
        >
          <Send size={15} /> {pending ? "Submitting…" : "Submit response"}
        </button>
      </div>
    </div>
  );
}
