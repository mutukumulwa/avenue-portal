import { prisma } from "@/lib/prisma";
import { fail } from "@/lib/action-result";
import { FIELD_LABELS, type ClientActionState } from "@/lib/validation/client";
import { normalizeLegalName } from "@/lib/normalize";

/**
 * P2002 (unique-violation) mapping for the client-master write paths. The DB
 * uniques on slug / nameNormalized / memberNumberPrefix are the real backstop
 * (kills the TOCTOU + concurrent-duplicate class C3); this turns the raw Prisma
 * error into a friendly SP-2 field error instead of leaking the code to the user.
 * Mirrors the `isP2002` pattern in settings/tenants/actions.ts.
 */
export function isP2002(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "P2002"
  );
}

/**
 * Which unique collided?
 *
 * ── UAT-HF P10.01 — DEF-014, and this function was the whole defect ──────────
 *
 * The run: "Submitting an already-used client legal name is correctly refused
 * with no duplicate created, but the entire feedback is 'That client conflicts
 * with an existing record.'" The field-specific branches below were already
 * written — they were simply unreachable.
 *
 * This read `err.meta.target` only. Under Prisma 7 **with the pg driver
 * adapter** that property is `undefined`; the constraint moved to
 * `meta.driverAdapterError.cause.constraint.fields`, with the index name in
 * `originalMessage`. Verified against a real Postgres:
 *
 *   meta.target                                        -> undefined
 *   meta.driverAdapterError.cause.constraint.fields    -> ['"operatorTenantId"', '"nameNormalized"']
 *   meta.driverAdapterError.cause.originalMessage      -> '... unique constraint
 *                                                         "Client_operatorTenantId_nameNormalized_key"'
 *
 * So `targetString()` returned "", every branch missed, and every duplicate —
 * name, slug or prefix — fell through to the generic sentence. The mapping did
 * not regress when it was written; it stopped working when the driver adapter
 * was adopted, silently, because the fallback is a plausible message.
 *
 * All three shapes are read now, so this survives the next such change: an
 * adapter that reports none of them still gets the fallback, and one that
 * reports any gets the right field.
 */
function targetString(err: unknown): string {
  const meta = (err as { meta?: Record<string, unknown> }).meta ?? {};

  // Pre-adapter Prisma: a field-name array, or occasionally the index name.
  const target = meta.target;
  if (Array.isArray(target) && target.length > 0) return target.join(",").toLowerCase();
  if (typeof target === "string" && target) return target.toLowerCase();

  // Prisma 7 + driver adapter.
  const cause = (meta.driverAdapterError as { cause?: Record<string, unknown> } | undefined)?.cause;
  const fields = (cause?.constraint as { fields?: unknown } | undefined)?.fields;
  if (Array.isArray(fields) && fields.length > 0) {
    // The adapter quotes them: '"operatorTenantId"'.
    return fields.map((f) => String(f).replace(/"/g, "")).join(",").toLowerCase();
  }
  // Last resort: the index name inside the driver's own message.
  if (typeof cause?.originalMessage === "string") return cause.originalMessage.toLowerCase();

  return "";
}

/**
 * Map a client-write P2002 to a `ClientActionState` failure with the right field
 * error (and, for a name collision, a link to the existing client — DEF-014).
 * Returns `null` when `err` is not a P2002 so the caller can fall through.
 */
export async function mapClientP2002(
  err: unknown,
  ctx: { operatorTenantId: string; name: string; values: Record<string, string> },
): Promise<ClientActionState | null> {
  if (!isP2002(err)) return null;
  const target = targetString(err);

  if (target.includes("namenormalized")) {
    const existing = await prisma.client.findFirst({
      where: {
        operatorTenantId: ctx.operatorTenantId,
        nameNormalized: normalizeLegalName(ctx.name),
      },
      select: { id: true, name: true },
    });
    return {
      ...fail({ name: [`A client named "${ctx.name}" already exists.`] }),
      values: ctx.values,
      ...(existing ? { duplicate: { id: existing.id, name: existing.name } } : {}),
    };
  }
  if (target.includes("membernumberprefix")) {
    return {
      ...fail({
        memberNumberPrefix: [`${FIELD_LABELS.memberNumberPrefix} is already in use — enter a unique one.`],
      }),
      values: ctx.values,
    };
  }
  if (target.includes("slug")) {
    return {
      ...fail({ slug: [`${FIELD_LABELS.slug} is already in use — enter a unique one.`] }),
      values: ctx.values,
    };
  }
  return {
    ...fail(undefined, "That client conflicts with an existing record."),
    values: ctx.values,
  };
}
