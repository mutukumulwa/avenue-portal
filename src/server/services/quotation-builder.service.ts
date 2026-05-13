import { prisma } from "@/lib/prisma";
import { TRPCError } from "@trpc/server";
import { HyperFormula } from "hyperformula";
import { auditChainService } from "./audit-chain.service";
import { pdfService } from "./pdf.service";
import { renderQuotationHtml } from "../templates/pdf/quotation.template";

// ─── STATUTORY TAX CONSTANTS (Kenyan regulations) ────────────────────────────
const STAMP_DUTY_PER_MEMBER_YEAR = 40;      // KES flat
const TRAINING_LEVY_PCT          = 0.002;   // 0.2% of post-loading pre-discount base
const PHCF_PCT                   = 0.0025;  // 0.25% of post-loading pre-discount base

// ─── DISPLAY ORDER for line types ────────────────────────────────────────────
const LINE_ORDER: Record<string, number> = {
  BASE_CONTRIBUTION:    10,
  LOADING_PER_LIFE:     20,
  LOADING_SCHEME:       25,
  DISCOUNT_GROUP_SIZE:  30,
  DISCOUNT_LOYALTY:     35,
  DISCOUNT_CUSTOM:      40,
  STAMP_DUTY:           50,
  TRAINING_LEVY:        55,
  PHCF:                 60,
  CARD_ISSUANCE_FEE:    70,
  SMART_CARD_FEE:       75,
  WELCOME_PACK_FEE:     80,
  CO_CONTRIBUTION_PROVISION: 90,
  CUSTOM:               95,
};

// ─── QUOTATION BUILDER SERVICE ────────────────────────────────────────────────

export const quotationBuilderService = {
  // ── 1. Main orchestration ─────────────────────────────────────────────────

  /**
   * Builds all QuotationLineItems for an ASSESSED quotation.
   * Returns the computed total contribution.
   */
  async buildQuote(quotationId: string, tenantId: string, assessorId: string, opts: {
    groupSizeDiscountOverridePct?: number;
    loyaltyDiscountPct?: number;
    customDiscountPct?: number;
    customDiscountDescription?: string;
    cardIssuanceFeePerLife?: number;
    smartCardFeePerLife?: number;
    welcomePackFeePerLife?: number;
    validityDays?: number;
  } = {}) {
    const quotation = await prisma.quotation.findUnique({
      where: { id: quotationId, tenantId },
      include: {
        lives: { include: { decision: true } },
        broker: { select: { name: true } },
      },
    });
    if (!quotation) throw new TRPCError({ code: "NOT_FOUND", message: "Quotation not found" });
    if (!["ASSESSED", "DRAFT"].includes(quotation.status)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Quotation must be in ASSESSED status to build pricing" });
    }
    if (!quotation.packageId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Package must be selected before building pricing" });
    }

    // Clear any existing line items (rebuilding from scratch)
    await prisma.quotationLineItem.deleteMany({ where: { quotationId, tenantId } });

    const pkg = await prisma.package.findUnique({ where: { id: quotation.packageId } });
    const baseRatePerLife = Number(pkg?.contributionAmount ?? 0);
    const totalLives = quotation.lives.length;

    // ── Step 2: Base contribution per life ───────────────────
    const principalLives = quotation.lives.filter((l) => l.role === "PRINCIPAL");

    let baseTotal = 0;
    const baseLines: Array<Parameters<typeof prisma.quotationLineItem.create>[0]["data"]> = [];

    for (const life of principalLives) {
      const lifeBase = baseRatePerLife;
      baseTotal += lifeBase;
      baseLines.push({
        tenantId, quotationId,
        lineType: "BASE_CONTRIBUTION",
        description: `Base contribution — ${life.firstName} ${life.lastName}`,
        quotationLifeId: life.id,
        lifeName: `${life.firstName} ${life.lastName}`,
        baseAmount: lifeBase,
        netAmount: lifeBase,
        displayOrder: LINE_ORDER.BASE_CONTRIBUTION,
      });
    }

    // Also add dependant base contributions
    const dependantLives = quotation.lives.filter((l) => l.role === "DEPENDANT");
    for (const dep of dependantLives) {
      const depBase = baseRatePerLife * 0.6; // 60% for dependants (standard; override via pricing model)
      baseTotal += depBase;
      baseLines.push({
        tenantId, quotationId,
        lineType: "BASE_CONTRIBUTION",
        description: `Base contribution — ${dep.firstName} ${dep.lastName} (Dependant)`,
        quotationLifeId: dep.id,
        lifeName: `${dep.firstName} ${dep.lastName}`,
        baseAmount: depBase,
        netAmount: depBase,
        displayOrder: LINE_ORDER.BASE_CONTRIBUTION,
      });
    }

    await prisma.$transaction(baseLines.map((data) => prisma.quotationLineItem.create({ data })));

    // ── Step 3: Per-life loadings (multiplicative) ────────────
    let loadingTotal = 0;
    const loadingLines: Array<Parameters<typeof prisma.quotationLineItem.create>[0]["data"]> = [];

    for (const life of quotation.lives) {
      if (!life.decision?.loadingMultiplier) continue;
      const multiplier = Number(life.decision.loadingMultiplier);
      const base = Number((baseLines.find((b) => b.quotationLifeId === life.id)?.baseAmount) ?? 0);
      const loadingAmt = base * (multiplier - 1); // only the extra, not the full base
      loadingTotal += loadingAmt;
      loadingLines.push({
        tenantId, quotationId,
        lineType: "LOADING_PER_LIFE",
        description: `Loading ×${multiplier.toFixed(2)} — ${life.firstName} ${life.lastName}`,
        quotationLifeId: life.id,
        lifeName: `${life.firstName} ${life.lastName}`,
        baseAmount: base,
        adjustmentPct: multiplier - 1,
        netAmount: loadingAmt,
        displayOrder: LINE_ORDER.LOADING_PER_LIFE,
      });
    }
    if (loadingLines.length > 0) {
      await prisma.$transaction(loadingLines.map((data) => prisma.quotationLineItem.create({ data })));
    }

    const postLoadingBase = baseTotal + loadingTotal;

    // ── Step 4: Discounts ─────────────────────────────────────
    const discountLines: Array<Parameters<typeof prisma.quotationLineItem.create>[0]["data"]> = [];
    let discountTotal = 0;

    // Group size auto-discount
    const groupSizePct = opts.groupSizeDiscountOverridePct ??
      (totalLives > 200 ? 0.10 : totalLives > 100 ? 0.05 : 0);
    if (groupSizePct > 0) {
      const amt = postLoadingBase * groupSizePct;
      discountTotal += amt;
      discountLines.push({
        tenantId, quotationId,
        lineType: "DISCOUNT_GROUP_SIZE",
        description: `Group size discount (${(groupSizePct * 100).toFixed(0)}% — ${totalLives} lives)`,
        baseAmount: postLoadingBase,
        adjustmentPct: -groupSizePct,
        netAmount: -amt,
        displayOrder: LINE_ORDER.DISCOUNT_GROUP_SIZE,
      });
    }

    // Loyalty discount
    const loyaltyPct = opts.loyaltyDiscountPct ?? 0;
    if (loyaltyPct > 0) {
      const amt = postLoadingBase * loyaltyPct;
      discountTotal += amt;
      discountLines.push({
        tenantId, quotationId,
        lineType: "DISCOUNT_LOYALTY",
        description: `Loyalty discount (${(loyaltyPct * 100).toFixed(1)}%)`,
        baseAmount: postLoadingBase,
        adjustmentPct: -loyaltyPct,
        netAmount: -amt,
        displayOrder: LINE_ORDER.DISCOUNT_LOYALTY,
      });
    }

    // Custom discount
    const customDiscountPct = opts.customDiscountPct ?? 0;
    if (customDiscountPct > 0) {
      const amt = postLoadingBase * customDiscountPct;
      discountTotal += amt;
      discountLines.push({
        tenantId, quotationId,
        lineType: "DISCOUNT_CUSTOM",
        description: opts.customDiscountDescription ?? `Custom discount (${(customDiscountPct * 100).toFixed(1)}%)`,
        baseAmount: postLoadingBase,
        adjustmentPct: -customDiscountPct,
        netAmount: -amt,
        displayOrder: LINE_ORDER.DISCOUNT_CUSTOM,
      });
    }

    if (discountLines.length > 0) {
      await prisma.$transaction(discountLines.map((data) => prisma.quotationLineItem.create({ data })));
    }

    const netBase = postLoadingBase - discountTotal;

    // ── Step 5: Statutory taxes ───────────────────────────────
    // Stamp duty: KES 40 flat per member per year
    const stampDuty = STAMP_DUTY_PER_MEMBER_YEAR * totalLives;
    // Training levy and PHCF on post-loading pre-discount base (per spec §4 Step 6)
    const trainingLevy = postLoadingBase * TRAINING_LEVY_PCT;
    const phcf         = postLoadingBase * PHCF_PCT;

    await prisma.$transaction([
      prisma.quotationLineItem.create({ data: {
        tenantId, quotationId,
        lineType: "STAMP_DUTY",
        description: `Stamp Duty (KES ${STAMP_DUTY_PER_MEMBER_YEAR}/member × ${totalLives} lives)`,
        baseAmount: totalLives * STAMP_DUTY_PER_MEMBER_YEAR,
        netAmount:  stampDuty,
        displayOrder: LINE_ORDER.STAMP_DUTY,
        isTax: true,
      } as never }),
      prisma.quotationLineItem.create({ data: {
        tenantId, quotationId,
        lineType: "TRAINING_LEVY",
        description: `Training Levy (${(TRAINING_LEVY_PCT * 100).toFixed(1)}% of base)`,
        baseAmount: postLoadingBase,
        adjustmentPct: TRAINING_LEVY_PCT,
        netAmount: trainingLevy,
        displayOrder: LINE_ORDER.TRAINING_LEVY,
        isTax: true,
      } as never }),
      prisma.quotationLineItem.create({ data: {
        tenantId, quotationId,
        lineType: "PHCF",
        description: `PHCF (${(PHCF_PCT * 100).toFixed(2)}% of base)`,
        baseAmount: postLoadingBase,
        adjustmentPct: PHCF_PCT,
        netAmount: phcf,
        displayOrder: LINE_ORDER.PHCF,
        isTax: true,
      } as never }),
    ]);

    // ── Step 6: Ancillary charges ─────────────────────────────
    const ancillaryLines: Array<Parameters<typeof prisma.quotationLineItem.create>[0]["data"]> = [];

    const cardFee = opts.cardIssuanceFeePerLife ?? 0;
    if (cardFee > 0) {
      ancillaryLines.push({
        tenantId, quotationId,
        lineType: "CARD_ISSUANCE_FEE",
        description: `Card issuance fee (${totalLives} lives × KES ${cardFee})`,
        baseAmount: cardFee * totalLives,
        netAmount:  cardFee * totalLives,
        displayOrder: LINE_ORDER.CARD_ISSUANCE_FEE,
      });
    }
    if (opts.smartCardFeePerLife && opts.smartCardFeePerLife > 0) {
      const fee = opts.smartCardFeePerLife * totalLives;
      ancillaryLines.push({
        tenantId, quotationId,
        lineType: "SMART_CARD_FEE",
        description: `Smart card fee (${totalLives} lives × KES ${opts.smartCardFeePerLife})`,
        baseAmount: fee,
        netAmount: fee,
        displayOrder: LINE_ORDER.SMART_CARD_FEE,
      });
    }
    if (opts.welcomePackFeePerLife && opts.welcomePackFeePerLife > 0) {
      const fee = opts.welcomePackFeePerLife * totalLives;
      ancillaryLines.push({
        tenantId, quotationId,
        lineType: "WELCOME_PACK_FEE",
        description: `Welcome pack fee (${totalLives} lives × KES ${opts.welcomePackFeePerLife})`,
        baseAmount: fee,
        netAmount: fee,
        displayOrder: LINE_ORDER.WELCOME_PACK_FEE,
      });
    }

    if (ancillaryLines.length > 0) {
      await prisma.$transaction(ancillaryLines.map((data) => prisma.quotationLineItem.create({ data })));
    }

    // ── Step 7: Total ─────────────────────────────────────────
    const ancillaryTotal = ancillaryLines.reduce((s, l) => s + Number(l.netAmount), 0);
    const totalContribution = netBase + stampDuty + trainingLevy + phcf + ancillaryTotal;

    // Write totals back to quotation
    const validityDays = opts.validityDays ?? 30;
    const expiresAt = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000);

    await prisma.quotation.update({
      where: { id: quotationId },
      data: {
        annualPremium: baseTotal,
        finalPremium: totalContribution,
        ratePerMember: totalLives > 0 ? totalContribution / totalLives : 0,
        validUntil: expiresAt,
        status: "DRAFT",
      },
    });

    await auditChainService.append({
      actorId: assessorId,
      action: "QUOTATION:PRICING_BUILT",
      module: "QUOTATION",
      entityType: "Quotation",
      entityId: quotationId,
      payload: { totalContribution, lineCount: baseLines.length + loadingLines.length + discountLines.length + 3 },
      tenantId,
      description: `Quotation ${quotation.quoteNumber} pricing built — total KES ${totalContribution.toLocaleString()}`,
    });

    return { totalContribution, lineCount: await prisma.quotationLineItem.count({ where: { quotationId } }) };
  },

  // ── 2. Excel custom pricing model ────────────────────────────────────────

  async runExcelModel(quotationId: string, modelFileId: string, tenantId: string): Promise<number[]> {
    const modelFile = await prisma.customPricingModelFile.findUnique({ where: { id: modelFileId } });
    if (!modelFile || modelFile.fileType !== "EXCEL") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Excel pricing model file not found" });
    }

    const quotation = await prisma.quotation.findUnique({
      where: { id: quotationId },
      include: { lives: true },
    });
    if (!quotation) throw new TRPCError({ code: "NOT_FOUND", message: "Quotation not found" });

    const inputSnapshot = { lives: quotation.lives.map((l) => ({ id: l.id, age: Math.floor((Date.now() - new Date(l.dateOfBirth).getTime()) / (365.25e10)), gender: l.gender, role: l.role })) };
    const startMs = Date.now();

    try {
      // Fetch the Excel file and parse with HyperFormula
      const response = await fetch(modelFile.fileUrl);
      const buffer = await response.arrayBuffer();

      // HyperFormula: load the workbook and extract computed values
      const hf = HyperFormula.buildEmpty({ licenseKey: "gpl-v3" });

      // Parse sheets from the Excel file using a simple CSV-like extraction
      // For full XLSX support, combine with ExcelJS for data, then HyperFormula for formulas
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer as never);

      const sheet = wb.worksheets[0];
      if (!sheet) throw new Error("Workbook has no sheets");

      // Build a 2D array from the sheet for HyperFormula
      const sheetData: (string | number | boolean | null)[][] = [];
      sheet.eachRow((row, rowNum) => {
        const rowData: (string | number | boolean | null)[] = [];
        row.eachCell({ includeEmpty: true }, (cell) => {
          const v = cell.value;
          if (v === null || v === undefined) rowData.push(null);
          else if (typeof v === "object" && "formula" in v) rowData.push(`=${(v as { formula: string }).formula}`);
          else if (typeof v === "number") rowData.push(v);
          else if (typeof v === "boolean") rowData.push(v);
          else rowData.push(String(v));
        });
        sheetData[rowNum - 1] = rowData;
      });

      hf.addSheet("Sheet1");
      hf.setSheetContent(0, sheetData as never);

      // Inject census totals into named cells (convention: A1 = principal count, A2 = dependant count)
      const principals = quotation.lives.filter((l) => l.role === "PRINCIPAL").length;
      const dependants = quotation.lives.filter((l) => l.role === "DEPENDANT").length;
      hf.setCellContents({ col: 0, row: 0, sheet: 0 }, [[principals]]);
      hf.setCellContents({ col: 0, row: 1, sheet: 0 }, [[dependants]]);

      // Read output from a named column (convention: column B = per-life contribution)
      const contributions: number[] = [];
      for (let i = 0; i < principals + dependants; i++) {
        const val = hf.getCellValue({ col: 1, row: i, sheet: 0 });
        contributions.push(typeof val === "number" ? val : 0);
      }

      const outputSnapshot = { contributions };
      await prisma.customPricingRunLog.create({
        data: {
          tenantId, quotationId, modelFileId,
          inputSnapshot: inputSnapshot as never,
          outputSnapshot: outputSnapshot as never,
          executionMs: Date.now() - startMs,
          succeeded: true,
        },
      });

      return contributions;
    } catch (err) {
      await prisma.customPricingRunLog.create({
        data: {
          tenantId, quotationId, modelFileId,
          inputSnapshot: inputSnapshot as never,
          executionMs: Date.now() - startMs,
          succeeded: false,
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      });
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Excel model evaluation failed: ${err instanceof Error ? err.message : err}` });
    }
  },

  // ── 3. Python custom pricing model (Pyodide sandbox) ─────────────────────

  async runPythonModel(quotationId: string, modelFileId: string, tenantId: string): Promise<number[]> {
    const modelFile = await prisma.customPricingModelFile.findUnique({ where: { id: modelFileId } });
    if (!modelFile || modelFile.fileType !== "PYTHON") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Python pricing model file not found" });
    }

    const quotation = await prisma.quotation.findUnique({
      where: { id: quotationId },
      include: { lives: true },
    });
    if (!quotation) throw new TRPCError({ code: "NOT_FOUND", message: "Quotation not found" });

    const inputSnapshot = {
      principals: quotation.lives.filter((l) => l.role === "PRINCIPAL").length,
      dependants:  quotation.lives.filter((l) => l.role === "DEPENDANT").length,
      lives: quotation.lives.map((l) => ({
        id: l.id,
        age: Math.floor((Date.now() - new Date(l.dateOfBirth).getTime()) / (365.25e10)),
        gender: l.gender,
        role: l.role,
      })),
    };
    const startMs = Date.now();

    try {
      // Fetch the Python script
      const response = await fetch(modelFile.fileUrl);
      const script = await response.text();

      // Dynamic import of Pyodide — only loaded when needed
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { loadPyodide } = await import("pyodide" as any);
      const pyodide = await loadPyodide();

      // Pass census data as a JSON global
      pyodide.globals.set("census_json", JSON.stringify(inputSnapshot));

      // Execute with a 30-second timeout enforced via Promise.race
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Python model execution timed out (30s)")), 30_000)
      );

      await Promise.race([
        pyodide.runPythonAsync(script),
        timeout,
      ]);

      // Read output from `output_json` global
      const rawOutput = pyodide.globals.get("output_json");
      if (!rawOutput) throw new Error("Python model did not set `output_json`");

      const output = JSON.parse(String(rawOutput)) as { contributions: number[] };
      const contributions = output.contributions ?? [];

      await prisma.customPricingRunLog.create({
        data: {
          tenantId, quotationId, modelFileId,
          inputSnapshot: inputSnapshot as never,
          outputSnapshot: output as never,
          executionMs: Date.now() - startMs,
          succeeded: true,
        },
      });

      return contributions;
    } catch (err) {
      await prisma.customPricingRunLog.create({
        data: {
          tenantId, quotationId, modelFileId,
          inputSnapshot: inputSnapshot as never,
          executionMs: Date.now() - startMs,
          succeeded: false,
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      });
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Python model execution failed: ${err instanceof Error ? err.message : err}` });
    }
  },

  // ── 4. Generate quotation PDF ─────────────────────────────────────────────

  async generatePdf(quotationId: string, tenantId: string): Promise<Buffer> {
    const quotation = await prisma.quotation.findUnique({
      where: { id: quotationId, tenantId },
      include: {
        lineItems: { orderBy: { displayOrder: "asc" } },
        broker: { select: { name: true } },
        lives: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!quotation) throw new TRPCError({ code: "NOT_FOUND", message: "Quotation not found" });

    const pkg = quotation.packageId
      ? await prisma.package.findUnique({ where: { id: quotation.packageId }, select: { name: true } })
      : null;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, logoUrl: true },
    });

    const html = renderQuotationHtml({
      quoteNumber: quotation.quoteNumber,
      issuedDate: new Date().toLocaleDateString("en-KE"),
      validUntil: quotation.validUntil ? new Date(quotation.validUntil).toLocaleDateString("en-KE") : "—",
      tenantName: tenant?.name ?? "Avenue Healthcare",
      tenantLogoUrl: tenant?.logoUrl ?? undefined,
      clientName: quotation.legalName ?? quotation.prospectName ?? "—",
      clientType: quotation.clientType ?? "CORPORATE",
      packageName: pkg?.name ?? "—",
      requestedCoverStart: quotation.requestedCoverStart ? new Date(quotation.requestedCoverStart).toLocaleDateString("en-KE") : "—",
      brokerName: quotation.broker?.name,
      lineItems: quotation.lineItems.map((l) => ({
        description: l.description,
        lineType: l.lineType,
        lifeName: l.lifeName ?? undefined,
        baseAmount: Number(l.baseAmount),
        netAmount: Number(l.netAmount),
        isTax: ["STAMP_DUTY", "TRAINING_LEVY", "PHCF"].includes(l.lineType),
      })),
      totalContribution: Number(quotation.finalPremium ?? 0),
      memberCount: quotation.memberCount,
      dependentCount: quotation.dependentCount,
    });

    return pdfService.renderToPdf(html, { format: "A4" });
  },

  // ── 5. Issue quotation ────────────────────────────────────────────────────

  async issueQuote(quotationId: string, tenantId: string, assessorId: string): Promise<{ pdfBuffer: Buffer; quoteNumber: string }> {
    const quotation = await prisma.quotation.findUnique({ where: { id: quotationId, tenantId } });
    if (!quotation) throw new TRPCError({ code: "NOT_FOUND", message: "Quotation not found" });
    if (!["DRAFT", "ASSESSED"].includes(quotation.status)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Only DRAFT or ASSESSED quotations can be issued" });
    }
    if (!quotation.validUntil) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Build pricing before issuing (validUntil not set)" });
    }

    // Generate PDF
    const pdfBuffer = await quotationBuilderService.generatePdf(quotationId, tenantId);

    // Save a version snapshot
    const versionCount = await prisma.quotationVersion.count({ where: { quotationId } });
    const snapshot = await prisma.quotation.findUnique({
      where: { id: quotationId },
      include: { lineItems: { orderBy: { displayOrder: "asc" } } },
    });

    await prisma.quotationVersion.create({
      data: {
        tenantId,
        quotationId,
        versionNumber: versionCount + 1,
        status: "SENT",
        snapshotData: snapshot as never,
        issuedById: assessorId,
        issuedAt: new Date(),
        expiresAt: quotation.validUntil,
      },
    });

    // Move to SENT status
    await prisma.quotation.update({
      where: { id: quotationId },
      data: { status: "SENT" },
    });

    await auditChainService.append({
      actorId: assessorId,
      action: "QUOTATION:ISSUED",
      module: "QUOTATION",
      entityType: "Quotation",
      entityId: quotationId,
      payload: { versionNumber: versionCount + 1, expiresAt: quotation.validUntil },
      tenantId,
      description: `Quotation ${quotation.quoteNumber} issued (v${versionCount + 1})`,
    });

    return { pdfBuffer, quoteNumber: quotation.quoteNumber };
  },

  // ── 6. Expire stale quotations (called by daily job) ─────────────────────

  async expireStale(tenantId: string): Promise<number> {
    const now = new Date();
    const { count } = await prisma.quotation.updateMany({
      where: { tenantId, status: "SENT", validUntil: { lt: now } },
      data: { status: "EXPIRED" },
    });
    return count;
  },

  // ── 7. Get line items for a quotation ────────────────────────────────────

  async getLineItems(quotationId: string, tenantId: string) {
    return prisma.quotationLineItem.findMany({
      where: { quotationId, tenantId },
      orderBy: { displayOrder: "asc" },
    });
  },

  // ── 8. Get version history ────────────────────────────────────────────────

  async getVersionHistory(quotationId: string, tenantId: string) {
    return prisma.quotationVersion.findMany({
      where: { quotationId, tenantId },
      orderBy: { versionNumber: "desc" },
    });
  },
};
