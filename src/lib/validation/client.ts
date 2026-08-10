import { z } from "zod";
import type { ActionFailure } from "@/lib/action-result";
import { PREFIX_RE } from "@/lib/normalize";

/**
 * SP-1 — canonical validation for the client-master entity (DEF-013/014/015/017).
 *
 * The single source of truth for client create/edit rules, imported by the
 * create action and the edit action (there is no clients tRPC router or REST
 * write path — a rare single-door entity). Kills the run-03 client defects:
 *   - DEF-013 silent defaults: currency + type are required, allow-listed enums
 *     (no `formData.get("currency") || "UGX"`), and the edit schema requires
 *     currency explicitly so omitting it can no longer silently rewrite to UGX.
 *   - DEF-014 name uniqueness: name is trimmed + whitespace-collapsed here; the
 *     normalized-key uniqueness lives on the DB unique (backstopped, mapped to a
 *     friendly field error by the action).
 *   - DEF-015/017 prefix format: the optional prefix must match D3 (reject —
 *     never transform — the six unsafe categories); uniqueness is the DB unique.
 */

/** Currency allow-list. Mirrors the (module-private, non-exportable because that
 *  file is `"use server"`) list in settings/tenants/actions.ts — kept here as the
 *  canonical, importable copy so the schema and the form render the same set. */
export const ALLOWED_CURRENCIES = ["UGX", "KES", "USD"] as const;

/** All five PayerType values (as-const tuple so z.enum infers the literal union,
 *  which is assignable to Prisma's PayerType). */
export const PAYER_TYPE_VALUES = [
  "INSURER",
  "HMO",
  "EMPLOYER_SELF_FUNDED",
  "GOVERNMENT_SCHEME",
  "TPA_CLAIMS_MANAGER",
] as const;

/** The five values with human labels (DEF-013 — the two previously uncreatable
 *  values are now exposed and labelled). Order = form display order. */
export const PAYER_TYPES: ReadonlyArray<{
  value: (typeof PAYER_TYPE_VALUES)[number];
  label: string;
}> = [
  { value: "INSURER", label: "Insurer" },
  { value: "HMO", label: "HMO" },
  { value: "EMPLOYER_SELF_FUNDED", label: "Self-funded employer" },
  { value: "GOVERNMENT_SCHEME", label: "Government scheme" },
  { value: "TPA_CLAIMS_MANAGER", label: "TPA / Claims manager" },
];

/** Human field labels so every consumer renders errors consistently. */
export const FIELD_LABELS: Record<string, string> = {
  name: "Client name",
  type: "Client type",
  currency: "Currency",
  slug: "Code / slug",
  memberNumberPrefix: "Member-number prefix",
  status: "Status",
  parentClientId: "Parent client",
};

const SLUG_RE = /^[a-z0-9-]{3,60}$/;

/** Required legal name: trim → collapse internal whitespace → ≤ 160 chars. The
 *  collapse happens here so the stored `name` and the derived `nameNormalized`
 *  agree (C-003 case/space-padded duplicates). */
const nameField = z
  .string({ required_error: `${FIELD_LABELS.name} is required.` })
  .transform((s) => s.replace(/\s+/g, " ").trim())
  .refine((s) => s.length >= 1, { message: `${FIELD_LABELS.name} is required.` })
  .refine((s) => s.length <= 160, {
    message: `${FIELD_LABELS.name} must be at most 160 characters.`,
  });

const typeField = z.enum(PAYER_TYPE_VALUES, {
  errorMap: () => ({ message: `${FIELD_LABELS.type} is required.` }),
});

const currencyField = z.enum(ALLOWED_CURRENCIES, {
  errorMap: () => ({
    message: `${FIELD_LABELS.currency} must be one of ${ALLOWED_CURRENCIES.join(", ")}.`,
  }),
});

/** Optional slug: absent/blank → undefined (service derives from name); when
 *  present it must match the explicit slug regex (no lossy silent transform). */
const slugField = z
  .union([z.string(), z.undefined(), z.null()])
  .transform((s) => (s == null || s.trim() === "" ? undefined : s.trim().toLowerCase()))
  .refine((s) => s === undefined || SLUG_RE.test(s), {
    message: `${FIELD_LABELS.slug} must be 3–60 chars: lowercase letters, digits and hyphens.`,
  });

/** Optional D3 prefix: absent/blank → undefined; when present it must match D3
 *  AFTER a trim+uppercase courtesy (reject, don't transform, the six unsafe
 *  categories from C-004). Stored value is the canonical uppercase form. */
const prefixField = z
  .union([z.string(), z.undefined(), z.null()])
  .transform((s) => (s == null || s.trim() === "" ? undefined : s.trim().toUpperCase()))
  .refine((s) => s === undefined || PREFIX_RE.test(s), {
    message: `${FIELD_LABELS.memberNumberPrefix} must be 3–6 chars: an uppercase letter then letters/digits (e.g. LMU).`,
  });

const CLIENT_STATUSES = ["PROSPECT", "ACTIVE", "SUSPENDED", "TERMINATED"] as const;
const statusField = z.enum(CLIENT_STATUSES, {
  errorMap: () => ({ message: `${FIELD_LABELS.status} is invalid.` }),
});

const parentField = z
  .union([z.string(), z.undefined(), z.null()])
  .transform((s) => (s == null || s.trim() === "" ? null : s.trim()));

/** Create schema — name/type/currency required; slug/prefix/parent optional. */
export const clientCreateSchema = z.object({
  name: nameField,
  type: typeField,
  currency: currencyField,
  slug: slugField,
  memberNumberPrefix: prefixField,
  parentClientId: parentField,
});

/** Edit schema — currency REQUIRED (kills the omission-rewrite bug); slug and
 *  prefix are NOT accepted (immutable post-creation, DEF-012); status editable. */
export const clientEditSchema = z.object({
  name: nameField,
  type: typeField,
  currency: currencyField,
  status: statusField,
  parentClientId: parentField,
});

export type ClientCreateInput = z.infer<typeof clientCreateSchema>;
export type ClientEditInput = z.infer<typeof clientEditSchema>;

/**
 * The client actions' return type. It is SP-2 `ActionResult` extended with two
 * UI-only carriers local to the client surface (the shared contract in
 * action-result.ts is deliberately left untouched):
 *   - `values`    — the raw submitted strings, echoed so the form's uncontrolled
 *                   inputs re-render with the user's input preserved (SP-2).
 *   - `duplicate` — a pointer to the existing client on a name collision, so the
 *                   form can render a real link to it (DEF-014).
 */
export type ClientActionState =
  | { ok: true }
  | (ActionFailure & {
      values?: Record<string, string>;
      duplicate?: { id: string; name: string };
    });
