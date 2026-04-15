import { prisma } from "@/lib/prisma";
import { enqueueEmail } from "@/lib/queue";
import * as nodemailer from "nodemailer";

type Channel = "EMAIL" | "SMS" | "BOTH";

// Pre-configured transport bound to the generic SMTP variables
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.mailtrap.io",
  port: parseInt(process.env.SMTP_PORT || "2525", 10),
  auth: {
    user: process.env.SMTP_USER || "test-user",
    pass: process.env.SMTP_PASS || "test-pass",
  },
});

export class NotificationService {
  /**
   * Render a template body by replacing {{variable}} placeholders.
   */
  static renderTemplate(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
  }

  /**
   * Internal mechanism triggered by the Worker
   */
  static async executeEmailDispatch(payload: { to: string; subject: string; body: string; html?: string; correspondenceId?: string }) {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"Avenue Healthcare" <noreply@avenue.co.ke>',
      to: payload.to,
      subject: payload.subject,
      text: payload.body,
      html: payload.html || payload.body.replace(/\n/g, "<br>"),
    });

    if (payload.correspondenceId) {
      await prisma.correspondence.update({
        where: { id: payload.correspondenceId },
        data: { status: "SENT", sentAt: new Date() }
      });
    }
  }

  /**
   * Enqueues a notification to a member using a stored template.
   */
  static async sendToMember(
    memberId: string,
    templateType: string,
    variables: Record<string, string> = {}
  ) {
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      include: { group: { include: { tenant: true } } },
    });
    if (!member) throw new Error("Member not found");

    const template = await prisma.notificationTemplate.findFirst({
      where: { tenantId: member.group.tenantId, type: templateType, isActive: true },
    });

    const body = template
      ? this.renderTemplate(template.bodyTemplate, variables)
      : `Notification: ${templateType}`;
    
    const subject = template?.subject ?? templateType;
    const channel: Channel = (template?.channel as Channel) ?? "EMAIL";

    // 1. Record pending correspondence immediately
    const correspondence = await prisma.correspondence.create({
      data: {
        memberId,
        type: templateType,
        channel,
        subject,
        body,
        status: "DRAFT",
      },
    });

    // 2. Queue Email Job asynchronously to unblock request thread
    if ((channel === "EMAIL" || channel === "BOTH") && member.email) {
      await enqueueEmail({
        to: member.email,
        subject,
        body,
        // Passing the ID allows the worker to flip the status to SENT upon delivery
        correspondenceId: correspondence.id
      });
      console.info(`[NotificationService] Queued email to ${member.email}`);
    }

    if (channel === "SMS" || channel === "BOTH") {
        // Africa's Talking SDK invocation goes here
        console.info(`[SMS STUB] Dispatching to ${member.phone}`);
    }

    return correspondence;
  }

  /**
   * Send renewal reminders to groups whose renewal date is within `daysAhead` days.
   */
  static async sendRenewalReminders(tenantId: string, daysAhead: number) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysAhead);

    const start = new Date(targetDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(targetDate);
    end.setHours(23, 59, 59, 999);

    const groups = await prisma.group.findMany({
      where: { tenantId, status: "ACTIVE", renewalDate: { gte: start, lte: end } },
      include: { members: { where: { status: "ACTIVE", relationship: "PRINCIPAL" } } },
    });

    const sent = [];
    for (const group of groups) {
      for (const principal of group.members) {
        const result = await this.sendToMember(principal.id, `RENEWAL_REMINDER_${daysAhead}`, {
          firstName: principal.firstName,
          groupName: group.name,
          renewalDate: group.renewalDate.toLocaleDateString("en-KE"),
          daysRemaining: String(daysAhead),
        });
        sent.push(result);
      }
    }

    return sent;
  }
}
