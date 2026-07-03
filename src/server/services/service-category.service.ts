import { prisma } from "@/lib/prisma";
import type { PatientClass, ServiceTier } from "@prisma/client";

// ─── SERVICE CATEGORY TAXONOMY SEED (spec §5.5 / §2.2, WP-E2) ────────────────
// Canonical, tenant-level service categories that contract tariff lines and
// claim lines map onto. Seeded from the §2.2 category list + the provider
// Masters (contracts/Masters/*.xlsx): Services & Procedures, Master Lab,
// Master Radiology, Inventory (pharmacy), Specialty and Doctors' masters.
// A TPA owns its own taxonomy (spec §20 open-question 7), so this is the
// platform default. Each top-level category carries its fee-schedule tier
// (WP-E1/D7); children inherit the parent tier at read time.

interface CatSeed {
  code: string;
  name: string;
  patientClass?: PatientClass;
  parent?: string;
  tier?: ServiceTier;
  /** Raw corpus labels (Masters/contract spellings incl. typos) → this category. */
  aliases?: string[];
}

const CATEGORIES: CatSeed[] = [
  // ── HEADLINE — the most-common services a contract is negotiated around ──
  { code: "CONSULTATION", name: "Consultation", patientClass: "OP", tier: "HEADLINE", aliases: ["CONSULTATION", "Outpatient Consultation Fees", "GP Consultation"] },
  { code: "SPECIALIST_CONSULTATION", name: "Specialist Consultation", patientClass: "OP", parent: "CONSULTATION", aliases: ["Specialist Consultation Fees (OP)", "Specialis Consultation Fees"] },
  { code: "IP_SERVICES", name: "Inpatient Services", patientClass: "IP", tier: "HEADLINE", aliases: ["IP SERVICES", "Ip Services", "NURSING CHARGES", "WARD CHARGES", "Bed Charges"] },
  { code: "IP_REVIEW", name: "Inpatient Review", patientClass: "IP", parent: "IP_SERVICES", aliases: ["IP Review Fees", "NUTRITIONIST REVIEW"] },
  { code: "ICU", name: "ICU/HDU/NICU", patientClass: "IP", parent: "IP_SERVICES", aliases: ["ICU", "HDU", "MONITOR CHARGES - HDU", "MONITOR CHARGES- ICU"] },
  { code: "CASUALTY", name: "Casualty / Emergency Room", patientClass: "OP", parent: "CONSULTATION", aliases: ["CASUALTY", "ER FEES", "Emergency Room Fees"] },

  // ── LABORATORY (Master Lab disciplines) ──────────────────────────────────
  { code: "LABORATORY", name: "Laboratory", tier: "LABORATORY", aliases: ["LAB", "Laboratory"] },
  { code: "LAB_BIOCHEMISTRY", name: "Biochemistry", parent: "LABORATORY", aliases: ["BIOCHEMISTRY"] },
  { code: "LAB_MICROBIOLOGY", name: "Microbiology", parent: "LABORATORY", aliases: ["MICROBIOLOGY", "MICROSCOPY", "CULTURE & SENSITIVITY"] },
  { code: "LAB_IMMUNOLOGY", name: "Immunology", parent: "LABORATORY", aliases: ["IMMUNOLOGY", "IMMUNOHISTOCHEMISTRY"] },
  { code: "LAB_SEROLOGY", name: "Serology", parent: "LABORATORY", aliases: ["SEROLOGY", "VIROLOGY"] },
  { code: "LAB_HAEMATOLOGY", name: "Haematology", parent: "LABORATORY", aliases: ["HAEMATOLOGY", "HEAMATOLOGY", "BLOOD TRANSFUSION"] },
  { code: "LAB_HISTOLOGY", name: "Histology / Cytology", parent: "LABORATORY", aliases: ["HISTOLOGY", "CYTOLOGY", "HISTOPATHOLOGY"] },
  { code: "LAB_MOLECULAR", name: "Molecular", parent: "LABORATORY", aliases: ["MOLECULAR"] },

  // ── IMAGING (Master Radiology categories) ────────────────────────────────
  { code: "RADIOLOGY", name: "Radiology / Imaging", tier: "IMAGING", aliases: ["RADIOLOGY", "IMAGING"] },
  { code: "XRAY", name: "X-Ray", parent: "RADIOLOGY", aliases: ["XRAY", "X-RAY"] },
  { code: "ULTRASOUND", name: "Ultrasound", parent: "RADIOLOGY", aliases: ["ULTRASOUND", "US", "OBSTETRIC SCAN"] },
  { code: "CT_SCAN", name: "CT Scan", parent: "RADIOLOGY", aliases: ["CT", "CT SCAN"] },
  { code: "MRI", name: "MRI", parent: "RADIOLOGY", aliases: ["MRI"] },
  { code: "MAMMOGRAPHY", name: "Mammography", parent: "RADIOLOGY", aliases: ["MAMMOGRAPHY", "MAMMOGRAM"] },

  // ── PHARMACY (Inventory Master split) ────────────────────────────────────
  { code: "PHARMACY", name: "Pharmacy", tier: "PHARMACY", aliases: ["PHARMACY", "DRUGS"] },
  { code: "PHARMACY_DRUGS", name: "Drugs / Medication", parent: "PHARMACY", aliases: ["Medication", "Drug"] },
  { code: "PHARMACY_CONSUMABLES", name: "Consumables & Sundries", parent: "PHARMACY", aliases: ["CONSUMABLES", "Consumable", "SUNDRIES", "Non-Pharmaceuticals"] },

  // ── THEATRE (Services Master Sheet2 fee bands + OT equipment) ────────────
  { code: "THEATRE", name: "Theatre / Surgical", patientClass: "OT", tier: "THEATRE", aliases: ["THEATER", "THEATRE", "Theatre Time/Fees", "THEATER FEES MAJOR", "THEATER FEES MINOR"] },
  { code: "OT_EQUIPMENT", name: "Theatre Equipment", patientClass: "OT", parent: "THEATRE", aliases: ["OT Equipment"] },
  { code: "GENERAL_SURGERY", name: "General Surgery", patientClass: "OT", parent: "THEATRE", aliases: ["General Surgery", "GENERAL SURGERY"] },
  { code: "OBS_GYNAE_SURGERY", name: "Obs & Gynae Surgery", patientClass: "OT", parent: "THEATRE", aliases: ["Obs Gynae Surgery", "Obs Gynae"] },
  { code: "ORTHOPAEDIC_SURGERY", name: "Orthopaedic Surgery", patientClass: "OT", parent: "THEATRE", aliases: ["Orthopedic Surgery", "Orthopaedic Surgery"] },
  { code: "ENT_SURGERY", name: "ENT Surgery", patientClass: "OT", parent: "THEATRE", aliases: ["Ent Surgery"] },
  { code: "OPHTHALMOLOGY_SURGERY", name: "Ophthalmology Surgery", patientClass: "OT", parent: "THEATRE", aliases: ["Ophalmology Surgery", "Ophthalmology Surgery"] },

  // ── PROFESSIONAL FEES (Doctors' / Specialty masters) ─────────────────────
  { code: "PROFESSIONAL_FEES", name: "Professional Fees", tier: "PROFESSIONAL_FEES", aliases: ["Doctor's Fees", "DOCTORS FEES"] },
  { code: "SURGEON_FEES", name: "Surgeon Fees", parent: "PROFESSIONAL_FEES", aliases: ["SURGEON FEES", "Surgeon's Fees"] },
  { code: "ANAESTHETIST_FEES", name: "Anaesthetist Fees", parent: "PROFESSIONAL_FEES", aliases: ["ANAESTHETIST FEES", "Anaesthesia Fees"] },

  // ── OTHER SERVICES ───────────────────────────────────────────────────────
  { code: "PROCEDURE", name: "Procedure", tier: "OTHER", aliases: ["Procedure", "PROCEDURE", "Service and Procedures"] },
  { code: "MINOR_PROCEDURE", name: "Minor Procedure", parent: "PROCEDURE", aliases: ["Mo Minor Procedure", "MO MINOR PROCEDURE", "Mo Pocedures", "MO POCEDURES", "Minor Procedure"] },
  { code: "MATERNITY", name: "Maternity", tier: "OTHER", aliases: ["MATERNITY", "Maternity Package"] },
  { code: "DIALYSIS", name: "Dialysis", tier: "OTHER", aliases: ["Dialysis", "DIALYSIS", "Dialyais", "NHIF Dialysis Relif"] },
  { code: "AMBULANCE", name: "Ambulance", tier: "OTHER", aliases: ["AMBULANCE", "AMBULANCE WITHIN 50KM", "ACLS Ambulance"] },
  { code: "PHYSIOTHERAPY", name: "Physiotherapy", tier: "OTHER", aliases: ["Physio", "PHYSIOTHERAPY", "Physiotherapy Opd", "Physiotherapy Ipd"] },
  { code: "DENTAL", name: "Dental", tier: "OTHER", aliases: ["Dental", "DENTAL"] },
  { code: "OPTICAL", name: "Optical", tier: "OTHER", aliases: ["OPTICAL SERVICES", "Optical Services", "OPTICAL"] },
  { code: "ONCOLOGY", name: "Oncology", tier: "OTHER", aliases: ["ONCOLOGY"] },
  { code: "MENTAL_WELLNESS", name: "Mental Wellness", tier: "OTHER" },
  { code: "PALLIATIVE", name: "Palliative Care", tier: "OTHER" },
  { code: "OVERSEAS", name: "Overseas Treatment", tier: "OTHER" },
  { code: "LAST_OFFICE", name: "Last Office", tier: "OTHER", aliases: ["Last Office"] },
  { code: "CONTRACT_PACKAGE", name: "Package (episode-priced)", tier: "OTHER", aliases: ["Package", "PACKAGE"] },
];

export class ServiceCategoryService {
  /**
   * Idempotent per-tenant seed of the canonical taxonomy (parents first),
   * including fee-schedule tiers (WP-E1) and raw-label aliases from the
   * provider Masters (WP-E2). Safe to re-run as new Masters arrive.
   */
  static async seedForTenant(tenantId: string) {
    const idByCode = new Map<string, string>();
    // Two passes so parents resolve before children.
    for (const pass of [0, 1]) {
      for (const c of CATEGORIES) {
        if ((pass === 0) !== (c.parent === undefined)) continue;
        const parentId = c.parent ? idByCode.get(c.parent) ?? null : null;
        const row = await prisma.serviceCategory.upsert({
          where: { tenantId_code: { tenantId, code: c.code } },
          create: { tenantId, code: c.code, name: c.name, patientClass: c.patientClass, parentId, tier: c.tier ?? null },
          update: { name: c.name, patientClass: c.patientClass, parentId, tier: c.tier ?? null },
        });
        idByCode.set(c.code, row.id);
      }
    }

    // Aliases: raw corpus labels (Masters spellings incl. typos) → canonical
    // category. Upsert-by-lookup keeps the seed idempotent.
    let aliasCount = 0;
    for (const c of CATEGORIES) {
      const serviceCategoryId = idByCode.get(c.code);
      if (!serviceCategoryId || !c.aliases) continue;
      for (const rawLabel of c.aliases) {
        const existing = await prisma.serviceCategoryAlias.findFirst({
          where: { tenantId, rawLabel },
          select: { id: true },
        });
        if (existing) {
          await prisma.serviceCategoryAlias.update({
            where: { id: existing.id },
            data: { serviceCategoryId },
          });
        } else {
          await prisma.serviceCategoryAlias.create({
            data: { tenantId, serviceCategoryId, rawLabel },
          });
        }
        aliasCount++;
      }
    }
    return CATEGORIES.length;
  }

  /**
   * Resolve a raw label from a contract / provider master to a canonical
   * category via the alias table (exact, then case-insensitive).
   */
  static async resolveLabel(tenantId: string, rawLabel: string) {
    const alias = await prisma.serviceCategoryAlias.findFirst({
      where: { tenantId, rawLabel: { equals: rawLabel.trim(), mode: "insensitive" } },
      include: { serviceCategory: true },
    });
    return alias?.serviceCategory ?? null;
  }

  /**
   * Effective fee-schedule tier for a category: own tier, else nearest
   * ancestor's (children inherit at read time per WP-E1).
   */
  static async effectiveTier(categoryId: string): Promise<ServiceTier | null> {
    let current = await prisma.serviceCategory.findUnique({
      where: { id: categoryId },
      select: { tier: true, parentId: true },
    });
    while (current) {
      if (current.tier) return current.tier;
      if (!current.parentId) return null;
      current = await prisma.serviceCategory.findUnique({
        where: { id: current.parentId },
        select: { tier: true, parentId: true },
      });
    }
    return null;
  }
}
