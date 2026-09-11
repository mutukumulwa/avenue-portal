/**
 * Family Hospital UAT plan P03 — one set of classes for every provider capture
 * control. The old forms used `focus:outline-none` with only a border colour
 * change; these keep a visible focus ring for keyboard users (P03.02 "visible
 * focus", P06 "visible focus") and mark invalid fields without relying on
 * colour alone (the message beside them carries the meaning).
 */
export const CAPTURE_LABEL = "mb-1 block text-[11px] font-bold uppercase text-brand-text-muted";

export const CAPTURE_INPUT =
  "w-full rounded-lg border border-[#DDDDDD] bg-white px-3 py-2 text-sm text-brand-text-body " +
  "focus:border-brand-indigo focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo/60 " +
  "aria-[invalid=true]:border-[#DC3545] disabled:cursor-not-allowed disabled:bg-[#F5F5F5] disabled:text-brand-text-muted";

export const CAPTURE_HINT = "mt-1 text-[11px] text-brand-text-muted";

export const CAPTURE_ERROR = "mt-1 text-[11px] font-semibold text-[#DC3545]";

export const CAPTURE_BUTTON_SECONDARY =
  "inline-flex items-center gap-1.5 rounded-lg border border-[#DDDDDD] bg-white px-3 py-2 text-sm font-semibold text-brand-indigo " +
  "hover:bg-brand-bg-alt focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo/60 disabled:opacity-50";

export const CAPTURE_BUTTON_PRIMARY =
  "inline-flex items-center gap-2 rounded-full bg-brand-indigo px-6 py-2.5 font-semibold text-white hover:bg-brand-secondary " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo/60 focus-visible:ring-offset-2 disabled:opacity-50";

export const LISTBOX =
  "absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-[#DDDDDD] bg-white py-1 text-sm shadow-lg";
