"use server";

/**
 * Diagnosis Gate — protocol library server actions (C3.2 / C3.3).
 *
 * Every mutation the clinical content lifecycle needs, reachable from the UI. The
 * services own the rules; these actions own authorisation, form parsing and audit.
 *
 * Authorisation is deliberately two-layered: `requireRole` keeps the page inside the
 * clinical roles, and `rbacService.requirePermission` enforces the specific capability —
 * so a CLAIMS_OFFICER who can reach the page to READ it still cannot import or approve
 * clinical content.
 */
import { requireRole, ROLES } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { rbacService } from "@/server/services/rbac.service";
import { auditChainService } from "@/server/services/audit-chain.service";
import { ProtocolPackService } from "@/server/services/diagnosis-gate/protocol-pack.service";
import { validatePack } from "@/server/services/diagnosis-gate/pack-validate";
import type { ProtocolPack } from "@/server/services/diagnosis-gate/pack-types";

const PATH = "/settings/clinical-protocols";

function fail(msg: string, packId?: string): never {
  redirect(`${PATH}${packId ? `/${packId}` : ""}?error=${encodeURIComponent(msg)}`);
}
/**
 * `redirect()` signals by THROWING. Never call this inside a `try` whose `catch`
 * reports failure, or the success redirect is caught and re-reported as the error
 * "NEXT_REDIRECT" — which is exactly what the C3.2 walkthrough hit. Every action below
 * therefore does its work in the try and redirects on success AFTER it.
 */
function done(msg: string, packId?: string): never {
  redirect(`${PATH}${packId ? `/${packId}` : ""}?ok=${encodeURIComponent(msg)}`);
}

async function auditProtocol(actorId: string, tenantId: string, action: string, packId: string, payload: Record<string, unknown>, description: string) {
  await auditChainService
    .append({ actorId, action, module: "CLAIMS", entityType: "ClinicalProtocolPack", entityId: packId, payload, tenantId, description })
    .catch(() => undefined);
}

/** Guard: page role + the specific capability. */
async function authorise(permission: string) {
  const session = await requireRole(ROLES.CLINICAL);
  const { id: userId, tenantId } = session.user;
  const ok = await rbacService.hasPermission(userId, permission, tenantId).catch(() => false);
  if (!ok) fail(`You do not have the ${permission} permission.`);
  return { userId, tenantId };
}

/**
 * Import a converted pack.json as a DRAFT.
 *
 * The upload is the pack JSON produced by `scripts/diagnosis-gate/convert-workbook.ts`,
 * not the raw workbook: conversion is deterministic and reviewable, and keeping the
 * spreadsheet parser out of the server keeps the reviewed artifact small and diffable.
 */
export async function importPackAction(formData: FormData) {
  const { userId, tenantId } = await authorise("CLINICAL_PROTOCOL:MANAGE");

  const file = formData.get("packFile") as File | null;
  const notes = ((formData.get("notes") as string) || "").trim() || undefined;
  if (!file || file.size === 0) fail("Choose a pack file to import.");
  if (file.size > 8 * 1024 * 1024) fail("That file is larger than 8 MB. Protocol packs are small — check you selected the pack JSON, not the workbook.");

  let pack: ProtocolPack;
  try {
    pack = JSON.parse(await file.text()) as ProtocolPack;
  } catch {
    fail("That file is not valid JSON. Run the converter first, then upload the pack.json it produces.");
  }
  if (!pack?.meta || !Array.isArray(pack.groups)) fail("That JSON is not a protocol pack — it has no meta block or condition list.");

  // Validate before writing so the reviewer sees every problem at once rather than
  // discovering them one failed import at a time.
  const preview = validatePack(pack);
  if (!preview.importable) {
    fail(`This pack has ${preview.errors.length} blocking error(s) and was not imported. First: ${preview.errors[0]?.message ?? "unknown"}`);
  }

  let created: { packId: string; version: number };
  try {
    const { packId, version, validation } = await ProtocolPackService.createDraftFromImport(tenantId, pack, { createdById: userId, notes });
    await auditProtocol(userId, tenantId, "CLINICAL_PROTOCOL:IMPORT", packId, { version, stats: validation.stats, sourceFileName: pack.meta.sourceFileName }, `Imported clinical protocol pack v${version} (${validation.stats.groups} conditions, ${validation.stats.labRules} tests).`);
    created = { packId, version };
  } catch (e) {
    fail(e instanceof Error ? e.message : "The pack could not be imported.");
  }
  revalidatePath(PATH);
  done(`Version ${created.version} imported as a draft. Nothing changes until it is approved and put in force.`, created.packId);
}

/** Maker step: open the governed approval. */
export async function submitPackAction(formData: FormData) {
  const { userId, tenantId } = await authorise("CLINICAL_PROTOCOL:MANAGE");
  const packId = (formData.get("packId") as string) || "";
  if (!packId) fail("No pack was selected.");
  try {
    const { requestId } = await ProtocolPackService.submitForApproval(tenantId, packId, userId);
    await auditProtocol(userId, tenantId, "CLINICAL_PROTOCOL:SUBMIT", packId, { requestId }, "Submitted clinical protocol pack for approval.");
  } catch (e) {
    fail(e instanceof Error ? e.message : "The pack could not be submitted.", packId);
  }
  revalidatePath(PATH);
  done("Sent for approval. A second clinician must approve it before it can be put in force.", packId);
}

/** Put an approved pack in force. Deliberately separate from approval. */
export async function activatePackAction(formData: FormData) {
  const { userId, tenantId } = await authorise("CLINICAL_PROTOCOL:APPROVE");
  const packId = (formData.get("packId") as string) || "";
  if (!packId) fail("No pack was selected.");
  try {
    await ProtocolPackService.activate(tenantId, packId, userId);
    await auditProtocol(userId, tenantId, "CLINICAL_PROTOCOL:ACTIVATE", packId, {}, "Put clinical protocol pack in force.");
  } catch (e) {
    fail(e instanceof Error ? e.message : "The pack could not be put in force.", packId);
  }
  revalidatePath(PATH);
  done("This version is now in force. The gate still records only — no claim is routed until the clinical gate is switched on.", packId);
}

/** Withdraw the pack in force. Leaves no active pack, which is always safe. */
export async function deactivatePackAction(formData: FormData) {
  const { userId, tenantId } = await authorise("CLINICAL_PROTOCOL:APPROVE");
  const packId = (formData.get("packId") as string) || "";
  const reason = ((formData.get("reason") as string) || "").trim();
  if (!reason) fail("Give a reason for withdrawing this content.", packId);
  try {
    await ProtocolPackService.deactivate(tenantId, packId, userId, reason);
    await auditProtocol(userId, tenantId, "CLINICAL_PROTOCOL:DEACTIVATE", packId, { reason }, `Withdrew clinical protocol pack: ${reason}`);
  } catch (e) {
    fail(e instanceof Error ? e.message : "The pack could not be withdrawn.", packId);
  }
  revalidatePath(PATH);
  done("Withdrawn. With no content in force the clinical stage passes every claim untouched.", packId);
}

/** Per-condition shadow/live switches (DG-D5). */
export async function setGroupEnablementAction(formData: FormData) {
  const { userId, tenantId } = await authorise("CLINICAL_PROTOCOL:APPROVE");
  const groupId = (formData.get("groupId") as string) || "";
  const packId = (formData.get("packId") as string) || "";
  const field = (formData.get("field") as string) || "";
  const value = formData.get("value") === "true";
  if (!groupId || (field !== "enabledForLive" && field !== "enabledForShadow")) fail("That switch is not recognised.", packId);

  try {
    await ProtocolPackService.setGroupEnablement(tenantId, groupId, { [field]: value });
    await auditProtocol(userId, tenantId, "CLINICAL_PROTOCOL:GROUP_TOGGLE", packId, { groupId, field, value }, `Set ${field}=${value} on a governed condition.`);
  } catch (e) {
    fail(e instanceof Error ? e.message : "That switch could not be changed.", packId);
  }
  revalidatePath(PATH);
  done(
    field === "enabledForLive"
      ? value
        ? "This condition will now route flagged claims for review once the clinical gate is switched on."
        : "This condition no longer routes claims; findings are still recorded."
      : value
        ? "This condition is being evaluated again."
        : "This condition is no longer evaluated.",
    packId,
  );
}
