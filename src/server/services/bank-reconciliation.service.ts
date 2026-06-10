/**
 * bank-reconciliation.service.ts — D-07
 *
 * Parses Excel/CSV bank statement exports and matches transaction rows
 * against Invoice/Payment records by reference number or amount.
 * Unmatched items are flagged for Finance review.
 */

import { prisma } from "@/lib/prisma";
import { TRPCError } from "@trpc/server";

export interface StatementRow {
  rowNumber:    number;
  date:         string;
  description:  string;
  reference:    string;
  amount:       number;
  balance:      number;
}

export interface ReconciliationMatch {
  statementRow: StatementRow;
  matchType:    "EXACT_REF" | "AMOUNT_REF" | "UNMATCHED";
  matchedInvoiceId?:  string;
  matchedInvoiceNumber?: string;
  matchedPaymentId?:  string;
  groupName?:   string;
  variance:     number;  // 0 for exact, non-zero for partial
}

export const bankReconciliationService = {

  /**
   * Parse a bank statement Excel/CSV buffer into structured rows.
   * Expects columns: Date | Description | Reference | Debit | Credit | Balance
   * (or any subset — detects by header row).
   */
  async parseStatement(buffer: Buffer): Promise<StatementRow[]> {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();

    // Try XLSX first; fall back to CSV parsing
    try {
      await wb.xlsx.load(buffer as never);
    } catch {
      // CSV fallback: split on newlines
      const text = buffer.toString("utf8");
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      return lines.slice(1).map((line, i) => {
        const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
        return {
          rowNumber:   i + 2,
          date:        cols[0] ?? "",
          description: cols[1] ?? "",
          reference:   cols[2] ?? "",
          amount:      parseFloat(cols[4] || cols[3] || "0") || 0,
          balance:     parseFloat(cols[5] || "0") || 0,
        };
      }).filter((r) => r.amount !== 0);
    }

    const sheet = wb.worksheets[0];
    if (!sheet) throw new TRPCError({ code: "BAD_REQUEST", message: "Empty workbook" });

    // Detect header row (first row with a date-like or "Date" cell)
    const rows: StatementRow[] = [];
    const headerRow = 1;
    sheet.eachRow((row, rowNum) => {
      if (rowNum === headerRow) return; // skip header
      const vals = (row.values as (string | number | Date | null)[]).slice(1);
      const date        = vals[0] ? String(vals[0]) : "";
      const description = vals[1] ? String(vals[1]) : "";
      const reference   = vals[2] ? String(vals[2]) : "";
      // Credit (col 4) or debit (col 3) — take credit as positive inflow
      const debit  = parseFloat(String(vals[3] ?? 0)) || 0;
      const credit = parseFloat(String(vals[4] ?? 0)) || 0;
      const amount = credit > 0 ? credit : -debit;
      const balance = parseFloat(String(vals[5] ?? 0)) || 0;

      if (amount === 0 && !description) return; // blank row
      rows.push({ rowNumber: rowNum, date, description, reference, amount, balance });
    });

    return rows;
  },

  /**
   * Match parsed statement rows against Invoice/Payment records.
   * Match strategy (in order):
   *   1. Invoice number appears in reference field
   *   2. Amount matches an unpaid invoice within KES 1 tolerance
   */
  async reconcile(
    tenantId: string,
    rows: StatementRow[],
  ): Promise<ReconciliationMatch[]> {
    const unpaidInvoices = await prisma.invoice.findMany({
      where: { tenantId, status: { in: ["SENT", "OVERDUE", "PARTIALLY_PAID"] } },
      select: {
        id: true, invoiceNumber: true, totalAmount: true, paidAmount: true, balance: true,
        group: { select: { name: true } },
      },
    });

    const results: ReconciliationMatch[] = [];

    for (const row of rows) {
      if (row.amount <= 0) {
        // Skip debits / bank charges for now
        results.push({ statementRow: row, matchType: "UNMATCHED", variance: row.amount });
        continue;
      }

      // Strategy 1: exact invoice number in reference
      const refUpper = row.reference.toUpperCase();
      const byRef = unpaidInvoices.find((inv) =>
        refUpper.includes(inv.invoiceNumber.toUpperCase())
      );
      if (byRef) {
        results.push({
          statementRow:         row,
          matchType:            "EXACT_REF",
          matchedInvoiceId:     byRef.id,
          matchedInvoiceNumber: byRef.invoiceNumber,
          groupName:            byRef.group.name,
          variance:             row.amount - Number(byRef.balance),
        });
        continue;
      }

      // Strategy 2: amount within KES 1 of an unpaid balance
      const byAmount = unpaidInvoices.find((inv) =>
        Math.abs(row.amount - Number(inv.balance)) <= 1
      );
      if (byAmount) {
        results.push({
          statementRow:         row,
          matchType:            "AMOUNT_REF",
          matchedInvoiceId:     byAmount.id,
          matchedInvoiceNumber: byAmount.invoiceNumber,
          groupName:            byAmount.group.name,
          variance:             row.amount - Number(byAmount.balance),
        });
        continue;
      }

      results.push({ statementRow: row, matchType: "UNMATCHED", variance: row.amount });
    }

    return results;
  },

  /**
   * Post a Payment record for a confirmed match.
   */
  async postPayment(
    tenantId: string,
    invoiceId: string,
    amount: number,
    reference: string,
    postedById: string,
    paymentDate: Date,
  ) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId, tenantId },
      select: { groupId: true, balance: true, invoiceNumber: true },
    });
    if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });

    await prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          groupId:         invoice.groupId,
          invoiceId,
          amount,
          paymentDate,
          paymentMethod:   "BANK_TRANSFER",
          referenceNumber: reference,
          reconciledAt:    new Date(),
        },
      });

      const newPaid   = Number(invoice.balance) <= amount ? "PAID" : "PARTIALLY_PAID";
      const paidAmount = Math.min(amount, Number(invoice.balance));

      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          paidAmount: { increment: paidAmount },
          balance:    { decrement: paidAmount },
          status:     newPaid,
        },
      });
    });
  },
};
