import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { groupId } = await params;
  const tenantId = session.user.tenantId;

  const group = await prisma.group.findUnique({
    where: { id: groupId, tenantId, fundingMode: "SELF_FUNDED" },
    include: {
      selfFundedAccount: {
        include: { transactions: { orderBy: { postedAt: "asc" } } },
      },
    },
  });
  if (!group?.selfFundedAccount) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const acc  = group.selfFundedAccount;
  const txns = acc.transactions;

  const headers = ["Date", "Type", "Description", "Reference", "Amount (KES)", "Balance After (KES)"];
  const rows    = txns.map(t => [
    new Date(t.postedAt).toISOString().split("T")[0],
    t.type,
    t.description,
    t.referenceNumber ?? "",
    (["DEPOSIT","TOP_UP","REFUND"].includes(t.type) ? "" : "-") + Number(t.amount).toString(),
    Number(t.balanceAfter).toString(),
  ]);

  // Prepend summary rows
  const summaryRows = [
    ["STATEMENT", group.name, "", "", "", ""],
    ["Period", new Date(acc.periodStartDate).toISOString().split("T")[0], "to", new Date(acc.periodEndDate).toISOString().split("T")[0], "", ""],
    ["Closing Balance", "", "", "", "", Number(acc.balance).toString()],
    ["Total Deposited", "", "", "", Number(acc.totalDeposited).toString(), ""],
    ["Total Claims", "", "", "", `-${Number(acc.totalClaims).toString()}`, ""],
    ["Admin Fees", "", "", "", `-${Number(acc.totalAdminFees).toString()}`, ""],
    ["", "", "", "", "", ""],
    headers,
    ...rows,
  ];

  const csv = summaryRows.map(row =>
    row.map(cell => (cell.includes(",") || cell.includes('"') ? `"${cell.replace(/"/g, '""')}"` : cell)).join(",")
  ).join("\r\n");

  const filename = `fund-statement-${group.name.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().split("T")[0]}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
