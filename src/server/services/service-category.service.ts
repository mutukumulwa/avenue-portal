import { prisma } from "@/lib/prisma";
import type { PatientClass } from "@prisma/client";

// ─── SERVICE CATEGORY TAXONOMY SEED (spec §5.5 / §2.2) ───────────────────────
// Canonical, tenant-level service categories that contract tariff lines and
// claim lines map onto. Seeded from the §2.2 category list. A TPA owns its own
// taxonomy (spec §20 open-question 7), so this is the platform default.

interface CatSeed { code: string; name: string; patientClass?: PatientClass; parent?: string }

const CATEGORIES: CatSeed[] = [
  { code: "CONSULTATION", name: "Consultation", patientClass: "OP" },
  { code: "SPECIALIST_CONSULTATION", name: "Specialist Consultation", patientClass: "OP", parent: "CONSULTATION" },
  { code: "LABORATORY", name: "Laboratory" },
  { code: "PHARMACY", name: "Pharmacy" },
  { code: "RADIOLOGY", name: "Radiology" },
  { code: "XRAY", name: "X-Ray", parent: "RADIOLOGY" },
  { code: "ULTRASOUND", name: "Ultrasound", parent: "RADIOLOGY" },
  { code: "CT_SCAN", name: "CT Scan", parent: "RADIOLOGY" },
  { code: "MRI", name: "MRI", parent: "RADIOLOGY" },
  { code: "PROCEDURE", name: "Procedure" },
  { code: "IP_SERVICES", name: "Inpatient Services", patientClass: "IP" },
  { code: "ICU", name: "ICU/HDU/NICU", patientClass: "IP", parent: "IP_SERVICES" },
  { code: "THEATRE", name: "Theatre / Surgical", patientClass: "OT" },
  { code: "MATERNITY", name: "Maternity" },
  { code: "DIALYSIS", name: "Dialysis" },
  { code: "AMBULANCE", name: "Ambulance" },
  { code: "PHYSIOTHERAPY", name: "Physiotherapy" },
  { code: "DENTAL", name: "Dental" },
  { code: "OPTICAL", name: "Optical" },
  { code: "ONCOLOGY", name: "Oncology" },
  { code: "MENTAL_WELLNESS", name: "Mental Wellness" },
  { code: "PALLIATIVE", name: "Palliative Care" },
  { code: "OVERSEAS", name: "Overseas Treatment" },
];

export class ServiceCategoryService {
  /** Idempotent per-tenant seed of the canonical taxonomy (parents first). */
  static async seedForTenant(tenantId: string) {
    const idByCode = new Map<string, string>();
    // Two passes so parents resolve before children.
    for (const pass of [0, 1]) {
      for (const c of CATEGORIES) {
        if ((pass === 0) !== (c.parent === undefined)) continue;
        const parentId = c.parent ? idByCode.get(c.parent) ?? null : null;
        const row = await prisma.serviceCategory.upsert({
          where: { tenantId_code: { tenantId, code: c.code } },
          create: { tenantId, code: c.code, name: c.name, patientClass: c.patientClass, parentId },
          update: { name: c.name, patientClass: c.patientClass, parentId },
        });
        idByCode.set(c.code, row.id);
      }
    }
    return CATEGORIES.length;
  }
}
