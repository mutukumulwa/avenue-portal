import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const q        = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const category = req.nextUrl.searchParams.get("category") ?? "";

  if (q.length < 2 && !category) return NextResponse.json([]);

  const results = await prisma.cPTCode.findMany({
    where: {
      AND: [
        category ? { serviceCategory: category } : {},
        q.length >= 2 ? {
          OR: [
            { code:        { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
            { category:    { contains: q, mode: "insensitive" } },
          ],
        } : {},
      ],
    },
    take: 20,
    orderBy: { code: "asc" },
  });

  return NextResponse.json(results);
}
