/**
 * Family Hospital UAT — how a tariff row's unit is described to people.
 *
 * Pure and client-safe. Shared by the provider service catalogue (search
 * results) and the P01.02 remediation planner (which reads the same "Unit"
 * column to tell a vial from a tablet), so both parse it identically.
 */
import type { UnitOfMeasure } from "@prisma/client";

const UNIT_LABELS: Record<UnitOfMeasure, string> = {
  PER_ITEM: "per item",
  PER_HOUR: "per hour",
  PER_DAY: "per day",
  PER_VISIT: "per visit",
  PER_SESSION: "per session",
  PER_EPISODE: "per episode",
  PER_ADMISSION: "per admission",
  PER_PROCEDURE: "per procedure",
  PER_CONSULTATION: "per consultation",
  PER_KM_BAND: "per distance band",
};

export function unitOfMeasureLabel(unit: UnitOfMeasure | string): string {
  return UNIT_LABELS[unit as UnitOfMeasure] ?? String(unit).toLowerCase().replace(/_/g, " ");
}

/**
 * The facility's own "Unit" column, as the 2026-08-28 load wrote it into
 * `ProviderTariff.notes` ("Unit: Vial"). Returns null when absent.
 */
export function recordedUnitFromNotes(notes: string | null | undefined): string | null {
  const m = notes?.match(/(?:^|;|\s)Unit:\s*([^;]+?)\s*(?:;|$)/i);
  return m ? m[1].trim() : null;
}
