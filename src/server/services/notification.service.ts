import { prisma } from "@/lib/prisma";
import { enqueueEmail } from "@/lib/queue";
import * as nodemailer from "nodemailer";

type Channel = "EMAIL" | "SMS" | "BOTH";

/**
 * Family Hospital UAT plan P05.02 step 3 — there is no fallback mail server.
 *
 * This transport used to fall back to `smtp.mailtrap.io` with the credentials
 * `test-user` / `test-pass` whenever SMTP_HOST was unset, so a production
 * deployment without mail configuration "sent" every message into a sandbox —
 * or failed in a way nobody could see — and reported success. A missing
 * SMTP_HOST is now an explicit configuration failure, which the callers record
 * (an invitation is marked FAILED with class CONFIG and can be resent).
 *
 * Under the test runner only (NODE_ENV=test), an unconfigured transport is a
 * JSON transport that delivers nothing anywhere.
 */
export class EmailConfigurationError extends Error {
  constructor() {
    super("SMTP is not configured");
    this.name = "EmailConfigurationError";
  }
}

function transporter(): nodemailer.Transporter {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) {
    if (process.env.NODE_ENV === "test") return nodemailer.createTransport({ jsonTransport: true });
    throw new EmailConfigurationError();
  }
  const port = Number.parseInt(process.env.SMTP_PORT ?? "", 10);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  return nodemailer.createTransport({
    host,
    // 587 (submission) when unset; never Mailtrap's 2525.
    port: Number.isFinite(port) ? port : 587,
    ...(user && pass ? { auth: { user, pass } } : {}),
  });
}

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
    await transporter().sendMail({
      from: process.env.EMAIL_FROM || '"Medvex" <noreply@medvex.co.ug>',
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
          renewalDate: group.renewalDate.toLocaleDateString("en-UG"),
          daysRemaining: String(daysAhead),
        });
        sent.push(result);
      }
    }

    return sent;
  }
}
