"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ClientsService } from "@/server/services/clients.service";
import { writeAudit } from "@/lib/audit";
import { fail } from "@/lib/action-result";
import { clientCreateSchema, type ClientActionState } from "@/lib/validation/client";
import { mapClientP2002 } from "../p2002";

/**
 * DEF-013/014/015/017 — create a client with NO silent defaults. Currency and
 * type are required allow-listed enums; the optional prefix must pass D3; name
 * uniqueness (normalized) and prefix/slug uniqueness are enforced by DB uniques
 * and surfaced as SP-2 field errors. On failure the action returns field errors
 * and echoes the submitted values (the form stays put, input preserved); it only
 * redirects on success, OUTSIDE any try/catch (redirect() throws — L-5).
 */
export async function createClientAction(
  _prev: ClientActionState | null,
  formData: FormData,
): Promise<ClientActionState> {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  // Raw strings echoed back on failure so uncontrolled inputs keep their values.
  const values: Record<string, string> = {
    name: (formData.get("name") as string) ?? "",
    type: (formData.get("type") as string) ?? "",
    currency: (formData.get("currency") as string) ?? "",
    memberNumberPrefix: (formData.get("memberNumberPrefix") as string) ?? "",
    slug: (formData.get("slug") as string) ?? "",
    parentClientId: (formData.get("parentClientId") as string) ?? "",
  };

  const parsed = clientCreateSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    currency: formData.get("currency"),
    slug: formData.get("slug"),
    memberNumberPrefix: formData.get("memberNumberPrefix"),
    parentClientId: formData.get("parentClientId"),
  });
  if (!parsed.success) {
    return { ...fail(parsed.error.flatten().fieldErrors), values };
  }

  let created: { id: string };
  try {
    created = await ClientsService.create(session.user.tenantId, {
      name: parsed.data.name,
      type: parsed.data.type,
      currency: parsed.data.currency,
      slug: parsed.data.slug,
      memberNumberPrefix: parsed.data.memberNumberPrefix,
      parentClientId: parsed.data.parentClientId,
    });
  } catch (err) {
    const mapped = await mapClientP2002(err, {
      operatorTenantId: session.user.tenantId,
      name: parsed.data.name,
      values,
    });
    if (mapped) return mapped;
    return {
      ...fail(undefined, err instanceof Error ? err.message : "Failed to create client"),
      values,
    };
  }

  await writeAudit({
    userId: session.user.id,
    action: "CLIENT_CREATED",
    module: "CLIENTS",
    description: `New client created: ${parsed.data.name} (${parsed.data.type})`,
    metadata: {
      clientId: created.id,
      before: JSON.stringify(null),
      after: JSON.stringify({
        name: parsed.data.name,
        type: parsed.data.type,
        currency: parsed.data.currency,
        slug: parsed.data.slug ?? null,
        memberNumberPrefix: parsed.data.memberNumberPrefix ?? "MVX",
        status: "ACTIVE",
        parentClientId: parsed.data.parentClientId,
      }),
    },
  });

  revalidatePath("/clients");
  redirect(`/clients/${created.id}`);
}
