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

/** Which unique collided? Prisma reports it in `err.meta.target` (field-name
 *  array on Postgres, sometimes the index name). Lower-cased + joined so a
 *  substring test is robust to either shape. */
function targetString(err: unknown): string {
  const target = (err as { meta?: { target?: unknown } }).meta?.target;
  return Array.isArray(target)
    ? target.join(",").toLowerCase()
    : String(target ?? "").toLowerCase();
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
