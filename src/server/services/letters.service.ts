/**
 * letters.service.ts — D-11: Letters and Memos
 *
 * Generates formal PDF letters for members using Puppeteer.
 * Creates a Correspondence record for every letter dispatched.
 * Letter types: Welcome, Renewal Notice, Termination Notice,
 * Lapse Notice, Reinstatement Confirmation, Custom Memo.
 */

import { prisma } from "@/lib/prisma";
import { TRPCError } from "@trpc/server";
import { pdfService } from "./pdf.service";
import { renderLetterHtml, type LetterType } from "../templates/pdf/letter.template";
import { auditChainService } from "./audit-chain.service";

// ─── Pre-composed body templates ─────────────────────────────────────────────

function buildLetterBody(
  type: LetterType,
  member: { firstName: string; lastName: string; memberNumber: string },
  ctx: Record<string, string> = {},
): string {
  const firstName = member.firstName;
  switch (type) {
    case "WELCOME":
      return `Dear ${firstName},\n\nWelcome to ${ctx.tenantName ?? "Medvex"} Membership! We are delighted to have you and your family as part of our healthcare community.\n\nYour membership number is <strong>${member.memberNumber}</strong>. Please keep this number safe as you will need it when accessing healthcare services at any of our network facilities.\n\nYour digital membership card is available immediately in the member portal. If you need assistance accessing any covered services, please contact our Member Services team.\n\nWe look forward to supporting your health and wellness journey.`;

    case "RENEWAL_NOTICE":
      return `Dear ${firstName},\n\nThis letter serves as formal notice that your membership (${member.memberNumber}) is due for renewal on <strong>${ctx.renewalDate ?? "the date indicated above"}</strong>.\n\nTo ensure uninterrupted access to your healthcare benefits, please arrange payment of your renewal contribution before the due date. If you have any questions about your renewal terms or wish to discuss any changes to your cover, please contact your account manager or our Member Services team at your earliest convenience.\n\nFailure to renew by the due date may result in a lapse of cover, after which a re-assessment and waiting period may apply.`;

    case "TERMINATION_NOTICE":
      return `Dear ${firstName},\n\nWe write to confirm that your membership (${member.memberNumber}) has been terminated with effect from <strong>${ctx.effectiveDate ?? "the date indicated above"}</strong>${ctx.reason ? ` due to: ${ctx.reason}` : ""}.\n\nAny outstanding benefit requests submitted before the termination date will continue to be processed in accordance with your membership terms. Any pro-rata refund due will be processed within 30 days.\n\nIf you believe this termination is in error or wish to appeal, please contact our Member Services team within 14 days of receiving this notice.`;

    case "LAPSE_NOTICE":
      return `Dear ${firstName},\n\nThis letter is to inform you that your membership (${member.memberNumber}) has lapsed due to non-payment of contributions.\n\nYour membership can be reinstated within the <strong>60-day catch-up window</strong> by settling the outstanding contributions plus any applicable reinstatement fee. After this window, a full re-assessment will be required.\n\nPlease contact us immediately if you wish to reinstate your membership or if you believe this lapse is in error.`;

    case "REINSTATEMENT_CONFIRMATION":
      return `Dear ${firstName},\n\nWe are pleased to confirm that your membership (${member.memberNumber}) has been successfully reinstated with effect from <strong>${ctx.effectiveDate ?? "today"}</strong>.\n\nYour previous membership terms, including any waiting periods already served, have been preserved. Your benefit balances have been restored to reflect your current cover period.\n\nThank you for your continued membership. Please contact our Member Services team if you have any questions.`;

    case "CUSTOM_MEMO":
      return ctx.body ?? `Dear ${firstName},\n\nPlease find below correspondence relating to your membership (${member.memberNumber}).\n\n${ctx.content ?? ""}`;
  }
}

// ─── SERVICE ──────────────────────────────────────────────────────────────────

export const lettersService = {
  /**
   * Generate a PDF letter and create a Correspondence record.
   */
  async generateLetter({
    tenantId,
    memberId,
    letterType,
    generatedById,
    context = {},
  }: {
    tenantId: string;
    memberId: string;
    letterType: LetterType;
    generatedById: string;
    context?: Record<string, string>;
  }): Promise<{ pdfBuffer: Buffer; correspondenceId: string }> {
    const [member, tenant] = await Promise.all([
      prisma.member.findUnique({
        where: { id: memberId, tenantId },
        include: {
          group:   { select: { name: true } },
          package: { select: { name: true } },
        },
      }),
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, logoUrl: true } }),
    ]);
    if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });

    const date           = new Date().toLocaleDateString("en-KE", { day: "2-digit", month: "long", year: "numeric" });
    const refNumber      = `LTR-${member.memberNumber}-${Date.now().toString(36).toUpperCase()}`;
    const body           = buildLetterBody(letterType, member, { tenantName: tenant?.name ?? "Medvex", ...context });
    const generatorUser  = await prisma.user.findUnique({ where: { id: generatedById }, select: { firstName: true, lastName: true } });

    const html = renderLetterHtml({
      letterType,
      tenantName:      tenant?.name ?? "Medvex",
      tenantLogoUrl:   tenant?.logoUrl ?? undefined,
      recipientName:   `${member.firstName} ${member.lastName}`,
      memberNumber:    member.memberNumber,
      groupName:       member.group.name,
      packageName:     member.package.name,
      date,
      referenceNumber: refNumber,
      body,
      signatory:       generatorUser ? `${generatorUser.firstName} ${generatorUser.lastName}` : "Member Services",
      signatoryTitle:  "Member Services Officer",
    });

    const pdfBuffer = await pdfService.renderToPdf(html, { format: "A4" });

    // Create a Correspondence record (using existing model fields)
    const correspondence = await prisma.correspondence.create({
      data: {
        memberId,
        type:    "LETTER",
        subject: `${letterType.replace(/_/g, " ")} — Ref: ${refNumber}`,
        body:    body.replace(/<[^>]+>/g, ""), // strip HTML for plain-text record
        channel: "LETTER",
        sentAt:  new Date(),
        status:  "SENT",
      },
    });

    await auditChainService.append({
      actorId:    generatedById,
      action:     "LETTER:GENERATED",
      module:     "CORRESPONDENCE",
      entityType: "Member",
      entityId:   memberId,
      payload:    { letterType, referenceNumber: refNumber, memberId },
      tenantId,
      description: `${letterType} letter generated for member ${member.memberNumber} (ref: ${refNumber})`,
    });

    return { pdfBuffer, correspondenceId: correspondence.id };
  },

  async getMemberLetters(memberId: string, _tenantId: string) {
    return prisma.correspondence.findMany({
      where: { memberId, type: "LETTER" },
      orderBy: { sentAt: "desc" },
      take: 20,
    });
  },
};
