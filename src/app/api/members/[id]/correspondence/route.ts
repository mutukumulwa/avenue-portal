import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  type: z.string().min(1),
  channel: z.enum(["EMAIL", "SMS", "BOTH"]),
  subject: z.string().optional(),
  body: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: memberId } = await params;
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // Verify member belongs to this tenant
  const member = await prisma.member.findUnique({
    where: { id: memberId, tenantId: session.user.tenantId },
    select: { id: true },
  });
  if (!member) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const entry = await prisma.correspondence.create({
    data: {
      memberId,
      type: parsed.data.type,
      channel: parsed.data.channel,
      subject: parsed.data.subject ?? null,
      body: parsed.data.body,
      status: "SENT",
    },
  });

  // Log activity
  await prisma.activityLog.create({
    data: {
      entityType: "MEMBER",
      entityId: memberId,
      memberId,
      action: "CORRESPONDENCE_LOGGED",
      description: `${parsed.data.channel} correspondence logged: ${parsed.data.type.replace(/_/g, " ")}`,
      userId: session.user.id,
    },
  });

  return NextResponse.json(entry, { status: 201 });
}
