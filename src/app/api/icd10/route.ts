import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);

  const results = await prisma.iCD10Code.findMany({
    where: {
      OR: [
        { code:        { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { category:    { contains: q, mode: "insensitive" } },
      ],
    },
    take: 20,
    orderBy: { code: "asc" },
  });

  return NextResponse.json(results);
}
