import { prisma } from "@/lib/prisma";
import type { GLSourceType } from "@prisma/client";

// ── Standard chart of accounts for a health insurer ──────────────────────────

export const STANDARD_ACCOUNTS = [
  // ASSETS
  { code: "1010", name: "Cash at Bank",                  type: "ASSET",     subtype: "Current Assets",   normalBalance: "DEBIT",  description: "Main operating bank account" },
  { code: "1020", name: "M-Pesa / Mobile Money",         type: "ASSET",     subtype: "Current Assets",   normalBalance: "DEBIT",  description: "Mobile money collections account" },
  { code: "1100", name: "Premium Receivables",           type: "ASSET",     subtype: "Current Assets",   normalBalance: "DEBIT",  description: "Amounts billed to groups but not yet collected" },
  { code: "1150", name: "Co-Contribution Receivable",   type: "ASSET",     subtype: "Current Assets",   normalBalance: "DEBIT",  description: "Member cost-sharing amounts owed but not yet collected" },
  { code: "1200", name: "Reinsurance Recoveries",        type: "ASSET",     subtype: "Current Assets",   normalBalance: "DEBIT",  description: "Claims recoverable from reinsurers" },
  { code: "1300", name: "Prepayments & Other Debtors",   type: "ASSET",     subtype: "Current Assets",   normalBalance: "DEBIT",  description: "Prepaid expenses and sundry debtors" },
  // LIABILITIES
  { code: "2010", name: "Claims Payable",                type: "LIABILITY", subtype: "Current Liabilities", normalBalance: "CREDIT", description: "Approved claims awaiting payment to providers" },
  { code: "2020", name: "Unearned Premium Reserve",      type: "LIABILITY", subtype: "Current Liabilities", normalBalance: "CREDIT", description: "Premium received/invoiced but not yet earned" },
  { code: "2030", name: "Commission Payable",            type: "LIABILITY", subtype: "Current Liabilities", normalBalance: "CREDIT", description: "Broker/agent commissions due" },
  { code: "2040", name: "Provider Payable",              type: "LIABILITY", subtype: "Current Liabilities", normalBalance: "CREDIT", description: "Amounts owed to providers — capitation, fees" },
  { code: "2100", name: "Reinsurance Premium Payable",   type: "LIABILITY", subtype: "Current Liabilities", normalBalance: "CREDIT", description: "Reinsurance premiums ceded but not yet remitted" },
  // EQUITY
  { code: "3010", name: "Share Capital",                 type: "EQUITY",    subtype: "Capital",            normalBalance: "CREDIT", description: "Paid-up share capital" },
  { code: "3020", name: "Retained Earnings",             type: "EQUITY",    subtype: "Capital",            normalBalance: "CREDIT", description: "Accumulated profits / (losses)" },
  // REVENUE
  { code: "4010", name: "Gross Written Premium",         type: "REVENUE",   subtype: "Premium Income",     normalBalance: "CREDIT", description: "Total premium earned on policies written" },
  { code: "4020", name: "Reinsurance Premium Ceded",     type: "REVENUE",   subtype: "Premium Income",     normalBalance: "DEBIT",  description: "Contra-revenue — premium ceded to reinsurers" },
  { code: "4030", name: "Reinsurance Claims Recovered",  type: "REVENUE",   subtype: "Other Income",       normalBalance: "CREDIT", description: "Claims recovered from reinsurance" },
  { code: "4040", name: "Other Income",                  type: "REVENUE",   subtype: "Other Income",       normalBalance: "CREDIT", description: "Sundry income not elsewhere classified" },
  // EXPENSES
  { code: "5010", name: "Net Claims Incurred",           type: "EXPENSE",   subtype: "Claims",             normalBalance: "DEBIT",  description: "Gross claims approved and incurred" },
  { code: "5020", name: "Claims Management Expense",     type: "EXPENSE",   subtype: "Claims",             normalBalance: "DEBIT",  description: "TPA fees, assessors, medical officers" },
  { code: "5030", name: "Broker Commission Expense",     type: "EXPENSE",   subtype: "Acquisition",        normalBalance: "DEBIT",  description: "Commissions paid to brokers and agents" },
  { code: "5040", name: "Reinsurance Commission Income", type: "EXPENSE",   subtype: "Acquisition",        normalBalance: "CREDIT", description: "Contra-expense — commission received from reinsurers" },
  { code: "5100", name: "Staff Costs",                   type: "EXPENSE",   subtype: "Operating",          normalBalance: "DEBIT",  description: "Salaries, NHIF, NSSF, pension" },
  { code: "5200", name: "General & Administrative",      type: "EXPENSE",   subtype: "Operating",          normalBalance: "DEBIT",  description: "Rent, utilities, IT, office supplies" },
  { code: "5300", name: "Depreciation & Amortisation",   type: "EXPENSE",   subtype: "Operating",          normalBalance: "DEBIT",  description: "Fixed-asset depreciation" },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getAccount(tenantId: string, code: string) {
  const acc = await prisma.chartOfAccount.findUnique({ where: { tenantId_code: { tenantId, code } } });
  if (!acc) throw new Error(`GL account ${code} not found — run Chart of Accounts setup first.`);
  return acc;
}

async function nextEntryNumber(tenantId: string) {
  const count = await prisma.journalEntry.count({ where: { tenantId } });
  return `JE-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;
}

interface LineSpec { accountCode: string; description?: string; debit?: number; credit?: number }

async function postEntry(
  tenantId: string,
  opts: {
    entryDate?: Date;
    description: string;
    reference?: string;
    sourceType: GLSourceType;
    sourceId?: string;
    postedById?: string;
    lines: LineSpec[];
  }
) {
  const entryNumber = await nextEntryNumber(tenantId);
  const accounts = await Promise.all(opts.lines.map(l => getAccount(tenantId, l.accountCode)));

  return prisma.journalEntry.create({
    data: {
      tenantId,
      entryNumber,
      entryDate:   opts.entryDate ?? new Date(),
      description: opts.description,
      reference:   opts.reference,
      sourceType:  opts.sourceType,
      sourceId:    opts.sourceId,
      postedById:  opts.postedById,
      lines: {
        create: opts.lines.map((l, i) => ({
          accountId:   accounts[i].id,
          description: l.description,
          debit:       l.debit  ?? 0,
          credit:      l.credit ?? 0,
        })),
      },
    },
  });
}

// ── GL Service ────────────────────────────────────────────────────────────────

export class GLService {

  /** Initialise the standard chart of accounts for a tenant (idempotent). */
  static async seedChartOfAccounts(tenantId: string) {
    for (const a of STANDARD_ACCOUNTS) {
      await prisma.chartOfAccount.upsert({
        where:  { tenantId_code: { tenantId, code: a.code } },
        update: {},
        create: { tenantId, ...a },
      });
    }
  }

  // ── Auto-posting rules ────────────────────────────────────────────────────

  /**
   * Invoice issued → DR Premium Receivables / CR Unearned Premium Reserve
   */
  static async postInvoiceIssued(tenantId: string, opts: {
    sourceId: string; reference: string; amount: number; postedById?: string;
  }) {
    return postEntry(tenantId, {
      description: `Premium invoice issued — ${opts.reference}`,
      reference:   opts.reference,
      sourceType:  "INVOICE_ISSUED",
      sourceId:    opts.sourceId,
      postedById:  opts.postedById,
      lines: [
        { accountCode: "1100", description: "Premium receivable raised",    debit:  opts.amount },
        { accountCode: "2020", description: "Unearned premium reserve",     credit: opts.amount },
      ],
    });
  }

  /**
   * Premium payment received →
   *   DR Cash / CR Premium Receivables  (clears debt)
   *   DR Unearned Premium Reserve / CR Gross Written Premium  (earns premium)
   */
  static async postPremiumReceived(tenantId: string, opts: {
    sourceId: string; reference: string; amount: number; method?: string; postedById?: string;
  }) {
    const cashCode = opts.method === "MPESA" ? "1020" : "1010";
    return postEntry(tenantId, {
      description: `Premium received — ${opts.reference}`,
      reference:   opts.reference,
      sourceType:  "PREMIUM_RECEIVED",
      sourceId:    opts.sourceId,
      postedById:  opts.postedById,
      lines: [
        { accountCode: cashCode, description: "Cash received",               debit:  opts.amount },
        { accountCode: "1100",   description: "Premium receivable cleared",  credit: opts.amount },
        { accountCode: "2020",   description: "Unearned premium released",   debit:  opts.amount },
        { accountCode: "4010",   description: "Gross written premium earned",credit: opts.amount },
      ],
    });
  }

  /**
   * Claim approved — splits into plan share and member co-contribution:
   *
   *   DR 5010 Net Claims Incurred   (full approved amount)
   *   CR 2010 Claims Payable        (plan share only — what the insurer pays the provider)
   *   CR 1150 Co-Contrib Receivable (member share — asset until collected or waived)
   *
   * If coContributionAmount is zero or omitted the full amount goes to Claims Payable
   * (backward compatible — existing call sites without co-contribution work unchanged).
   */
  /**
   * Claim approved — correct double-entry with co-contribution split:
   *
   * Without co-contribution (coContributionAmount = 0):
   *   DR 5010 Net Claims Incurred   approvedAmount
   *   CR 2010 Claims Payable        approvedAmount
   *
   * With co-contribution:
   *   DR 5010 Net Claims Incurred   planShare   (insurer's cost only)
   *   DR 1150 Co-Contrib Receivable coContrib   (member owes this — balance sheet asset)
   *   CR 2010 Claims Payable        approvedAmount (provider is owed the full amount)
   */
  static async postClaimApproved(tenantId: string, opts: {
    sourceId: string; reference: string; amount: number;
    coContributionAmount?: number; postedById?: string;
  }) {
    const coContrib = opts.coContributionAmount ?? 0;
    const planShare = opts.amount - coContrib;

    const lines: LineSpec[] = coContrib > 0
      ? [
          { accountCode: "5010", description: "Net claims incurred (plan share)",           debit:  planShare  },
          { accountCode: "1150", description: `Co-contribution receivable — ${opts.reference}`, debit: coContrib  },
          { accountCode: "2010", description: "Claims payable to provider",                 credit: opts.amount },
        ]
      : [
          { accountCode: "5010", description: "Claims incurred",  debit:  opts.amount },
          { accountCode: "2010", description: "Claims payable",   credit: opts.amount },
        ];

    return postEntry(tenantId, {
      description: coContrib > 0
        ? `Claim approved — ${opts.reference} (plan KES ${planShare.toLocaleString()} + member KES ${coContrib.toLocaleString()})`
        : `Claim approved — ${opts.reference}`,
      reference:  opts.reference,
      sourceType: "CLAIM_APPROVED",
      sourceId:   opts.sourceId,
      postedById: opts.postedById,
      lines,
    });
  }

  /**
   * Co-contribution collected from member →
   *   DR Cash / M-Pesa   (asset in)
   *   CR 1150 Co-Contribution Receivable  (clears the receivable)
   */
  static async postCoContributionCollected(tenantId: string, opts: {
    sourceId: string; reference: string; amount: number;
    paymentMethod?: string; postedById?: string;
  }) {
    const cashCode = opts.paymentMethod === "MPESA" ? "1020" : "1010";
    return postEntry(tenantId, {
      description: `Co-contribution collected — ${opts.reference}`,
      reference:   opts.reference,
      sourceType:  "CO_CONTRIBUTION_COLLECTED",
      sourceId:    opts.sourceId,
      postedById:  opts.postedById,
      lines: [
        { accountCode: cashCode, description: "Cash / M-Pesa received from member", debit:  opts.amount },
        { accountCode: "1150",   description: "Co-contribution receivable cleared",  credit: opts.amount },
      ],
    });
  }

  /**
   * Co-contribution waived →
   *   DR 5010 Net Claims Incurred  (insurer absorbs the waived member share)
   *   CR 1150 Co-Contribution Receivable  (removes the asset)
   */
  static async postCoContributionWaived(tenantId: string, opts: {
    sourceId: string; reference: string; amount: number; postedById?: string;
  }) {
    return postEntry(tenantId, {
      description: `Co-contribution waived — ${opts.reference}`,
      reference:   opts.reference,
      sourceType:  "CO_CONTRIBUTION_WAIVED",
      sourceId:    opts.sourceId,
      postedById:  opts.postedById,
      lines: [
        { accountCode: "5010", description: "Claims incurred (waived co-contrib)", debit:  opts.amount },
        { accountCode: "1150", description: "Co-contribution receivable written off", credit: opts.amount },
      ],
    });
  }

  /**
   * Claim payment made → DR Claims Payable / CR Cash
   */
  static async postClaimPaid(tenantId: string, opts: {
    sourceId: string; reference: string; amount: number; postedById?: string;
  }) {
    return postEntry(tenantId, {
      description: `Claim payment — ${opts.reference}`,
      reference:   opts.reference,
      sourceType:  "CLAIM_PAID",
      sourceId:    opts.sourceId,
      postedById:  opts.postedById,
      lines: [
        { accountCode: "2010", description: "Claims payable settled",  debit:  opts.amount },
        { accountCode: "1010", description: "Cash disbursed",          credit: opts.amount },
      ],
    });
  }

  /**
   * Commission earned → DR Commission Expense / CR Commission Payable
   */
  static async postCommissionEarned(tenantId: string, opts: {
    sourceId: string; reference: string; amount: number; postedById?: string;
  }) {
    return postEntry(tenantId, {
      description: `Broker commission — ${opts.reference}`,
      reference:   opts.reference,
      sourceType:  "COMMISSION_EARNED",
      sourceId:    opts.sourceId,
      postedById:  opts.postedById,
      lines: [
        { accountCode: "5030", description: "Commission expense",  debit:  opts.amount },
        { accountCode: "2030", description: "Commission payable",  credit: opts.amount },
      ],
    });
  }

  // ── Reporting queries ─────────────────────────────────────────────────────

  /** Trial balance: sum of debits and credits per account. */
  static async getTrialBalance(tenantId: string, asAt?: Date) {
    const accounts = await prisma.chartOfAccount.findMany({
      where: { tenantId, isActive: true },
      include: {
        journalLines: {
          where: asAt ? { journalEntry: { entryDate: { lte: asAt }, status: "POSTED" } } : { journalEntry: { status: "POSTED" } },
          select: { debit: true, credit: true },
        },
      },
      orderBy: { code: "asc" },
    });

    return accounts.map(a => {
      const totalDebit  = a.journalLines.reduce((s, l) => s + Number(l.debit),  0);
      const totalCredit = a.journalLines.reduce((s, l) => s + Number(l.credit), 0);
      const netBalance  = a.normalBalance === "DEBIT"
        ? totalDebit - totalCredit
        : totalCredit - totalDebit;
      return { ...a, totalDebit, totalCredit, netBalance };
    });
  }

  /** Account ledger: individual journal lines for one account, with running balance. */
  static async getAccountLedger(tenantId: string, accountCode: string, opts?: { from?: Date; to?: Date }) {
    const account = await getAccount(tenantId, accountCode);
    const lines = await prisma.journalLine.findMany({
      where: {
        accountId:    account.id,
        journalEntry: {
          tenantId,
          status: "POSTED",
          ...(opts?.from || opts?.to ? {
            entryDate: {
              ...(opts.from ? { gte: opts.from } : {}),
              ...(opts.to   ? { lte: opts.to   } : {}),
            },
          } : {}),
        },
      },
      include: { journalEntry: { select: { entryNumber: true, entryDate: true, description: true, reference: true, sourceType: true } } },
      orderBy: { journalEntry: { entryDate: "asc" } },
    });

    let running = 0;
    return {
      account,
      lines: lines.map(l => {
        const movement = account.normalBalance === "DEBIT"
          ? Number(l.debit) - Number(l.credit)
          : Number(l.credit) - Number(l.debit);
        running += movement;
        return { ...l, debit: Number(l.debit), credit: Number(l.credit), balance: running };
      }),
    };
  }

  /**
   * Endorsement adjustment →
   *   Addition (+amount): DR Premium Receivables / CR Unearned Premium Reserve
   *   Deletion (-amount): DR Unearned Premium Reserve / CR Premium Receivables (reversal)
   */
  static async postEndorsementAdjustment(tenantId: string, opts: {
    sourceId: string; reference: string; amount: number; postedById?: string;
  }) {
    const isAddition = opts.amount >= 0;
    const abs = Math.abs(opts.amount);
    return postEntry(tenantId, {
      description: `Endorsement adjustment — ${opts.reference} (${isAddition ? "addition" : "deletion"})`,
      reference:   opts.reference,
      sourceType:  "ENDORSEMENT_ADJUSTMENT",
      sourceId:    opts.sourceId,
      postedById:  opts.postedById,
      lines: isAddition
        ? [
            { accountCode: "1100", description: "Premium receivable raised",     debit:  abs },
            { accountCode: "2020", description: "Unearned premium reserve",      credit: abs },
          ]
        : [
            { accountCode: "2020", description: "Unearned premium reversed",     debit:  abs },
            { accountCode: "1100", description: "Premium receivable credited",   credit: abs },
          ],
    });
  }

  /** P&L summary: revenue minus expenses grouped by subtype. */
  static async getPLSummary(tenantId: string, opts?: { from?: Date; to?: Date }) {
    const tb = await GLService.getTrialBalance(tenantId, opts?.to);
    const revenue  = tb.filter(a => a.type === "REVENUE");
    const expenses = tb.filter(a => a.type === "EXPENSE");
    const totalRevenue  = revenue.reduce((s, a)  => s + a.netBalance, 0);
    const totalExpenses = expenses.reduce((s, a) => s + a.netBalance, 0);
    return { revenue, expenses, totalRevenue, totalExpenses, netProfit: totalRevenue - totalExpenses };
  }
}
