"use client";

/**
 * UAT-HF P04.02 — the two things DEF-071 said were missing: an explicitly
 * labelled draft to restore, and a plain statement of when it was saved.
 *
 * "Either restore an explicitly labelled draft, or state plainly that unsaved
 * data was lost." This is the first limb. The second is DraftSavedIndicator,
 * which keeps the operator informed *while* they type so an interruption is
 * never a surprise.
 */
import { formatInstant } from "@/lib/calendar-date";
import type { StoredDraft } from "@/lib/draft-store";
import { RotateCcw, Trash2 } from "lucide-react";

export function DraftBanner({
  draft,
  onRestore,
  onDiscard,
}: {
  draft: StoredDraft | null;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  if (!draft) return null;

  const fieldCount = Object.keys(draft.values).length;

  return (
    <div
      role="region"
      aria-label="Unsaved draft"
      className="mb-5 rounded-lg border border-brand-indigo/30 bg-brand-indigo/5 px-4 py-3"
    >
      <p className="text-sm font-semibold text-brand-text-heading">
        Unsaved draft from {formatInstant(new Date(draft.savedAt))}
      </p>
      <p className="mt-0.5 text-xs text-brand-text-muted">
        {fieldCount} {fieldCount === 1 ? "field was" : "fields were"} kept on this device when this form was last open.
        Nothing has been submitted. Restore them into the form, or discard them.
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onRestore}
          className="flex items-center gap-1.5 rounded-full bg-brand-indigo px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-secondary"
        >
          <RotateCcw size={13} />
          Restore draft
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="flex items-center gap-1.5 rounded-full border border-[#EEEEEE] px-4 py-1.5 text-xs font-semibold text-brand-text-muted transition-colors hover:bg-[#F8F9FA]"
        >
          <Trash2 size={13} />
          Discard draft
        </button>
      </div>
    </div>
  );
}

/**
 * The running "we have your work" signal.
 *
 * It says *where* the draft is, because "Draft saved" alone is the claim DEF-034
 * and DEF-067 were both punished for: the operator reads it as "submitted". This
 * text can only be read as "on this device, not sent".
 */
export function DraftSavedIndicator({ savedAt }: { savedAt: string | null }) {
  if (!savedAt) return null;
  return (
    <p className="text-xs text-brand-text-muted" role="status" aria-live="polite">
      Draft kept on this device at {formatInstant(new Date(savedAt))} — not submitted.
    </p>
  );
}
