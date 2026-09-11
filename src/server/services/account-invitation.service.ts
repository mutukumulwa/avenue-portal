import "server-only";

/**
 * Family Hospital UAT plan P05 — the ONE account-invitation service.
 *
 * FH-01: staff were created with an administrator-typed temporary password, no
 * invitation was sent, and two live passwords then went to the facility in one
 * shared, CC'd email. This service replaces that for every administration
 * surface (the TPA's Settings and a facility's own Users page — P05.04 step 4):
 *
 *   - invite: the account (with its provider persona and branches, or its other
 *     portal binding), a one-time setup invitation and the audit record are
 *     created in ONE transaction. The account's password is a random value
 *     nobody ever sees, and it must be replaced (`mustChangePassword`), so the
 *     account cannot be used until its owner sets a password (P05.01 step 2);
 *   - the setup link carries a 256-bit random token in the URL FRAGMENT; only
 *     its SHA-256 is stored; it expires after 24 hours (DEC-FH-05) and works once;
 *   - delivery happens after commit, bounded, to that person alone. Its state —
 *     PENDING, SENT or FAILED with a safe failure class — is stored, so a
 *     missing mail configuration is a visible, resendable failure and never a
 *     false success or a rolled-back account (P05.02);
 *   - resend revokes every older unused link, replaces the account's unusable
 *     secret (so any temporary password handed out earlier stops working) and is
 *     rate-limited per administrator, per account and per address;
 *   - completing setup checks the token again and, in one transaction, sets the
 *     password, clears the pending state, spends the token, revokes its siblings,
 *     bumps the session version and audits (P05.03).
 *
 * Never logged or stored anywhere: a password, a raw token, a setup URL. Audit
 * metadata carries ids, roles and states — no email address or name.
 */
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma, type PrismaClient, type UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PASSWORD_BCRYPT_COST, validatePassword } from "@/lib/password-policy";
import { approvedPublicOrigin } from "@/lib/public-origin";
import { sendEmailBounded, type EmailFailureClass } from "@/lib/queue";
import { ALL_USER_ROLES, isPortalRole } from "@/lib/constants";
import { PROVIDER_PERSONA_ROLE_CODES } from "@/../prisma/seeds/provider-rbac";
import type { ProviderAccessContext } from "./provider-access.service";
import { assertGrantablePersona, ProviderUserAdminError } from "./provider-user-admin.service";
import { captureEvent } from "./capture-telemetry";

type Db = PrismaClient | Prisma.TransactionClient;

/** DEC-FH-05. */
export const SETUP_LINK_TTL_HOURS = 24;

/** DEC-FH-X7 (executor defaults, adjustable). One-hour windows, counted in the database. */
export const INVITATION_RATE_LIMITS = { perActorPerHour: 30, perUserPerHour: 5, perAddressPerHour: 5 } as const;

export const DELIVERY_FAILED_MESSAGE = "User created; invitation delivery failed — resend.";
export const SETUP_LINK_INVALID_MESSAGE =
  "This setup link is not valid any more. It may have been used already, replaced by a newer one, or expired.";

/** Who is inviting. Authority comes from the session, never a form field. */
export type InvitationActor =
  | { kind: "PLATFORM"; tenantId: string; actorId: string; clientId: string | null }
  | { kind: "PROVIDER"; ctx: ProviderAccessContext };

export interface InvitationInput {
  email: string;
  firstName: string;
  lastName: string;
  /** A provider actor may only invite PROVIDER_USER. */
  role: UserRole;
  groupId?: string | null;
  brokerId?: string | null;
  memberId?: string | null;
  fundGroupIds?: string[];
  /** Ignored for a provider actor — always the actor's own provider. */
  providerId?: string | null;
  providerRoleCode?: string | null;
  providerBranchIds?: string[];
}

export type InvitationFailure = {
  ok: false;
  code: "VALIDATION" | "FORBIDDEN" | "EXISTS" | "THROTTLED" | "NOT_FOUND" | "NOT_PENDING";
  message: string;
  field?: string;
  /** Within the actor's scope only: the existing account and whether a new link may be sent. */
  existing?: { userId: string; canResend: boolean };
};

export type InvitationResult =
  | { ok: true; userId: string; invitationId: string; delivery: "SENT" | "FAILED"; failureClass: string | null; expiresAt: Date; message: string }
  | InvitationFailure;

export interface InvitationState {
  status: "PENDING" | "SENT" | "FAILED" | "EXPIRED" | "USED" | "REVOKED";
  issuedAt: Date;
  lastAttemptAt: Date | null;
  expiresAt: Date;
  failureClass: string | null;
}

// ─── primitives ──────────────────────────────────────────────────────────────

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
export const hashSetupToken = (raw: string) => sha256(raw);
const normalizeEmail = (raw: unknown) => (typeof raw === "string" ? raw.trim().toLowerCase() : "");
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/;
const HTML_RE = /<\s*[a-zA-Z/!]/;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().replace(/\s+/g, " ");
  return v && v.length <= 100 && !HTML_RE.test(v) ? v : null;
}

/** A value no person ever sees, hashed like a real password so sign-in cannot tell the difference. */
async function unusableSecretHash(): Promise<string> {
  return bcrypt.hash(randomBytes(32).toString("base64url"), PASSWORD_BCRYPT_COST);
}

function newToken() {
  const raw = randomBytes(32).toString("base64url"); // 43 characters, 256 bits
  return { raw, hash: hashSetupToken(raw) };
}

const fail = (code: InvitationFailure["code"], message: string, extra: Partial<InvitationFailure> = {}): InvitationFailure => ({ ok: false, code, message, ...extra });

function scopeOf(actor: InvitationActor) {
  return actor.kind === "PLATFORM"
    ? { tenantId: actor.tenantId, actorId: actor.actorId, providerId: null as string | null, module: "SETTINGS" }
    : { tenantId: actor.ctx.tenantId, actorId: actor.ctx.actorId, providerId: actor.ctx.providerId, module: "PROVIDERS" };
}

async function throttled(db: Db, where: Prisma.AccountSetupInvitationWhereInput, limit: number): Promise<boolean> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const n = await db.accountSetupInvitation.count({ where: { ...where, createdAt: { gte: since } } });
  return n >= limit;
}

async function audit(db: Db, row: { tenantId: string; actorId: string | null; action: string; module: string; entityId: string; description: string; metadata: Record<string, string | number | boolean | null> }) {
  await db.auditLog.create({
    data: {
      tenantId: row.tenantId,
      userId: row.actorId,
      action: row.action,
      module: row.module,
      entityType: "User",
      entityId: row.entityId,
      description: row.description,
      metadata: row.metadata,
    },
  });
}

// ─── delivery (after commit) ────────────────────────────────────────────────

async function deliver(
  invitation: { id: string; tenantId: string; providerId: string | null; userId: string },
  rawToken: string,
  to: { email: string; firstName: string },
  facilityName: string | null,
  module: string,
  actorId: string | null,
): Promise<{ status: "SENT" | "FAILED"; failureClass: string | null }> {
  const origin = approvedPublicOrigin();
  let outcome: { delivered: true } | { delivered: false; failureClass: EmailFailureClass | "ORIGIN" };
  if (!origin) {
    outcome = { delivered: false, failureClass: "ORIGIN" };
  } else {
    // The raw token appears in exactly one place: the body of this one message.
    const url = `${origin}/account-setup#token=${rawToken}`;
    outcome = await sendEmailBounded({
      to: to.email,
      subject: "Set up your Medvex account",
      body:
        `Hello ${to.firstName},\n\n` +
        `You have been invited to use the Medvex portal${facilityName ? ` for ${facilityName}` : ""}.\n\n` +
        `Set your password here:\n${url}\n\n` +
        `The link works once and expires in ${SETUP_LINK_TTL_HOURS} hours. If it has expired, open it anyway to ask for a new one, or ask your administrator.\n\n` +
        `If you were not expecting this invitation, you can ignore this email.`,
    });
  }
  const now = new Date();
  const status = outcome.delivered ? "SENT" : "FAILED";
  const failureClass = outcome.delivered ? null : outcome.failureClass;
  await prisma.accountSetupInvitation.update({
    where: { id: invitation.id },
    data: {
      deliveryAttempts: { increment: 1 },
      lastAttemptAt: now,
      deliveryStatus: status,
      failureClass,
      ...(outcome.delivered ? { deliveredAt: now } : {}),
    },
  });
  captureEvent("invitation_delivery", {
    invitationId: invitation.id,
    tenantId: invitation.tenantId,
    providerId: invitation.providerId,
    deliveryStatus: status,
    failureClass,
  });
  await audit(prisma, {
    tenantId: invitation.tenantId,
    actorId,
    action: outcome.delivered ? "ACCOUNT_SETUP_LINK_SENT" : "ACCOUNT_SETUP_LINK_DELIVERY_FAILED",
    module,
    entityId: invitation.userId,
    description: outcome.delivered ? "Account setup link delivered to the mail server" : "Account setup link could not be delivered",
    metadata: { invitationId: invitation.id, deliveryStatus: status, failureClass },
  }).catch(() => undefined);
  return { status, failureClass };
}

// ─── the service ─────────────────────────────────────────────────────────────

export const AccountInvitationService = {
  /** Create the account and send its setup link (P05.01, P05.02). */
  async invite(actor: InvitationActor, input: InvitationInput): Promise<InvitationResult> {
    const scope = scopeOf(actor);
    const email = normalizeEmail(input.email);
    const firstName = cleanName(input.firstName);
    const lastName = cleanName(input.lastName);
    if (!EMAIL_RE.test(email) || email.length > 254) return fail("VALIDATION", "Enter a valid email address.", { field: "email" });
    if (!firstName) return fail("VALIDATION", "Enter the first name (plain text, up to 100 characters).", { field: "firstName" });
    if (!lastName) return fail("VALIDATION", "Enter the last name (plain text, up to 100 characters).", { field: "lastName" });

    // ── role and binding, validated for this actor ──────────────────────────
    const role = input.role;
    let providerId: string | null = null;
    let providerRoleId: string | null = null;
    let branchIds: string[] = [];
    const fundGroupIds = (input.fundGroupIds ?? []).filter(Boolean);

    if (actor.kind === "PROVIDER") {
      const ctx = actor.ctx;
      if (!ctx.permissions.includes("provider.users.manage")) return fail("FORBIDDEN", "You do not have permission to invite staff.");
      if (role !== "PROVIDER_USER") return fail("FORBIDDEN", "You can only invite staff of your own facility.");
      providerId = ctx.providerId;
      if (!input.providerRoleCode) return fail("VALIDATION", "Choose the staff member's role.", { field: "providerRoleCode" });
      try {
        providerRoleId = await assertGrantablePersona(prisma, ctx, input.providerRoleCode);
      } catch (e) {
        if (e instanceof ProviderUserAdminError) return fail(e.code === "ROLE_NOT_AVAILABLE" ? "VALIDATION" : "FORBIDDEN", e.message, { field: "providerRoleCode" });
        throw e;
      }
      branchIds = [...new Set((input.providerBranchIds ?? []).filter(Boolean))];
      if (branchIds.length === 0) return fail("VALIDATION", "Assign at least one branch.", { field: "providerBranchIds" });
      // Only branches the inviting administrator can act at themselves.
      if (branchIds.some((b) => !ctx.allowedProviderBranchIds.includes(b))) return fail("FORBIDDEN", "You can only assign branches you have access to.", { field: "providerBranchIds" });
    } else {
      if (!(ALL_USER_ROLES as readonly string[]).includes(role)) return fail("VALIDATION", "Choose a role.", { field: "role" });
      if (role === "HR_MANAGER" && !input.groupId) return fail("VALIDATION", "Select the HR manager's group.", { field: "groupId" });
      if (role === "BROKER_USER" && !input.brokerId) return fail("VALIDATION", "Select the broker profile for this user.", { field: "brokerId" });
      if (role === "MEMBER_USER" && !input.memberId) return fail("VALIDATION", "Select the member profile for this user.", { field: "memberId" });
      if (role === "FUND_ADMINISTRATOR" && fundGroupIds.length === 0) return fail("VALIDATION", "Select at least one self-funded scheme for this fund administrator.", { field: "fundGroupIds" });
      if (role === "PROVIDER_USER") {
        providerId = input.providerId || null;
        if (!providerId) return fail("VALIDATION", "Select the facility for this provider user.", { field: "providerId" });
        if (!input.providerRoleCode || !PROVIDER_PERSONA_ROLE_CODES.includes(input.providerRoleCode)) return fail("VALIDATION", "Select the provider role for this user.", { field: "providerRoleCode" });
        branchIds = [...new Set((input.providerBranchIds ?? []).filter(Boolean))];
        if (branchIds.length === 0) return fail("VALIDATION", "Assign at least one branch to this provider user.", { field: "providerBranchIds" });
        const provider = await prisma.provider.findFirst({ where: { id: providerId, tenantId: scope.tenantId }, select: { id: true } });
        if (!provider) return fail("VALIDATION", "Facility not found.", { field: "providerId" });
        const providerRole = await prisma.role.findUnique({ where: { tenantId_code: { tenantId: scope.tenantId, code: input.providerRoleCode } }, select: { id: true, isActive: true } });
        if (!providerRole || !providerRole.isActive) return fail("VALIDATION", "Provider role is not available; run the RBAC seed for this tenant.", { field: "providerRoleCode" });
        providerRoleId = providerRole.id;
      }
      if (role === "HR_MANAGER" && input.groupId) {
        const group = await prisma.group.findFirst({ where: { id: input.groupId, tenantId: scope.tenantId }, select: { id: true } });
        if (!group) return fail("VALIDATION", "Group not found.", { field: "groupId" });
      }
      if (role === "BROKER_USER" && input.brokerId) {
        const broker = await prisma.broker.findFirst({ where: { id: input.brokerId, tenantId: scope.tenantId }, select: { id: true } });
        if (!broker) return fail("VALIDATION", "Broker profile not found.", { field: "brokerId" });
        if (await prisma.user.findFirst({ where: { tenantId: scope.tenantId, brokerId: input.brokerId }, select: { id: true } })) return fail("VALIDATION", "This broker already has a portal user.", { field: "brokerId" });
      }
      if (role === "MEMBER_USER" && input.memberId) {
        const clientId = actor.clientId;
        const member = await prisma.member.findFirst({
          where: { id: input.memberId, tenantId: scope.tenantId, ...(clientId ? { group: { clientId } } : {}) },
          select: { id: true },
        });
        if (!member) return fail("VALIDATION", "Member profile not found.", { field: "memberId" });
        if (await prisma.user.findFirst({ where: { tenantId: scope.tenantId, memberId: input.memberId }, select: { id: true } })) return fail("VALIDATION", "This member already has a portal user.", { field: "memberId" });
      }
      if (role === "FUND_ADMINISTRATOR") {
        const count = await prisma.group.count({ where: { tenantId: scope.tenantId, id: { in: fundGroupIds }, fundingMode: "SELF_FUNDED" } });
        if (count !== fundGroupIds.length) return fail("VALIDATION", "One or more selected schemes are not self-funded.", { field: "fundGroupIds" });
      }
    }

    if (role === "PROVIDER_USER" && providerId && branchIds.length > 0) {
      const branchCount = await prisma.providerBranch.count({ where: { id: { in: branchIds }, providerId, tenantId: scope.tenantId, isActive: true } });
      if (branchCount !== branchIds.length) return fail("VALIDATION", "One or more selected branches are not active branches of this facility.", { field: "providerBranchIds" });
    }

    // ── an address already in use: useful inside the actor's scope, silent outside it ──
    const existing = await prisma.user.findFirst({
      where: { email, tenantId: scope.tenantId },
      select: { id: true, role: true, providerId: true, isActive: true, mustChangePassword: true },
    });
    if (existing) {
      const visible = actor.kind === "PLATFORM" || (existing.role === "PROVIDER_USER" && existing.providerId === scope.providerId);
      if (!visible) return fail("EXISTS", "This email address cannot be used for a new account here. If this person should have access, contact Medvex.", { field: "email" });
      const pending = existing.isActive && existing.mustChangePassword;
      return fail("EXISTS", pending ? "An account with this email already exists and is waiting to be set up. You can send a new setup link." : "An account with this email already exists.", {
        field: "email",
        existing: { userId: existing.id, canResend: pending },
      });
    }

    const emailHash = sha256(email);
    if (await throttled(prisma, { invitedById: scope.actorId }, INVITATION_RATE_LIMITS.perActorPerHour)) return fail("THROTTLED", "Too many invitations sent in the last hour. Try again later.");
    if (await throttled(prisma, { emailHash }, INVITATION_RATE_LIMITS.perAddressPerHour)) return fail("THROTTLED", "Too many setup links have gone to this address in the last hour. Try again later.");

    const passwordHash = await unusableSecretHash();
    const token = newToken();
    const expiresAt = new Date(Date.now() + SETUP_LINK_TTL_HOURS * 60 * 60 * 1000);

    let created: { userId: string; invitationId: string };
    try {
      created = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            tenantId: scope.tenantId,
            email,
            firstName,
            lastName,
            role,
            passwordHash,
            isActive: true,
            mustChangePassword: true,
            ...(role === "HR_MANAGER" && input.groupId ? { groupId: input.groupId } : {}),
            ...(role === "BROKER_USER" && input.brokerId ? { brokerId: input.brokerId } : {}),
            ...(role === "MEMBER_USER" && input.memberId ? { memberId: input.memberId } : {}),
            ...(role === "PROVIDER_USER" && providerId ? { providerId } : {}),
            ...(role === "FUND_ADMINISTRATOR" ? { managedFundGroups: { connect: fundGroupIds.map((id) => ({ id })) } } : {}),
          },
          select: { id: true },
        });
        if (role === "PROVIDER_USER" && providerId && providerRoleId) {
          // Persona duty role — ACTIVE (PENDING_APPROVAL grants nothing) — and branch scope.
          await tx.userRoleAssignment.create({
            data: { userId: user.id, roleId: providerRoleId, tenantId: scope.tenantId, makerId: scope.actorId, checkerId: scope.actorId, isActive: true, status: "ACTIVE" },
          });
          for (const providerBranchId of branchIds) {
            await tx.providerUserBranchAssignment.create({ data: { tenantId: scope.tenantId, providerId, userId: user.id, providerBranchId, createdBy: scope.actorId } });
          }
        }
        const invitation = await tx.accountSetupInvitation.create({
          data: { tenantId: scope.tenantId, userId: user.id, providerId, tokenHash: token.hash, emailHash, expiresAt, issuedVia: "INVITE", invitedById: scope.actorId },
          select: { id: true },
        });
        await audit(tx, {
          tenantId: scope.tenantId,
          actorId: scope.actorId,
          action: "USER_INVITED",
          module: scope.module,
          entityId: user.id,
          description: `User invited as ${role} — account setup link issued`,
          metadata: {
            newUserId: user.id,
            role,
            linkedPortal: isPortalRole(role),
            invitationId: invitation.id,
            expiresAt: expiresAt.toISOString(),
            fundSchemeCount: fundGroupIds.length,
            providerId,
            providerRoleCode: role === "PROVIDER_USER" ? (input.providerRoleCode ?? null) : null,
            providerBranchCount: branchIds.length,
          },
        });
        return { userId: user.id, invitationId: invitation.id };
      });
    } catch (e) {
      // A concurrent invite for the same address won the unique (tenantId, email).
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return fail("EXISTS", "An account with this email already exists.", { field: "email" });
      }
      throw e;
    }

    const facility = providerId ? await prisma.provider.findUnique({ where: { id: providerId }, select: { name: true } }) : null;
    const delivered = await deliver(
      { id: created.invitationId, tenantId: scope.tenantId, providerId, userId: created.userId },
      token.raw,
      { email, firstName },
      facility?.name ?? null,
      scope.module,
      scope.actorId,
    );
    return {
      ok: true,
      userId: created.userId,
      invitationId: created.invitationId,
      delivery: delivered.status,
      failureClass: delivered.failureClass,
      expiresAt,
      message: delivered.status === "SENT" ? `Invitation sent to ${email}. The link expires in ${SETUP_LINK_TTL_HOURS} hours.` : DELIVERY_FAILED_MESSAGE,
    };
  },

  /**
   * Send a new setup link to an account that has not been set up yet. Every
   * older unused link stops working, and the account's secret is replaced — so
   * a temporary password handed out under the old process stops working too.
   */
  async resend(actor: InvitationActor, userId: string): Promise<InvitationResult> {
    const scope = scopeOf(actor);
    if (actor.kind === "PROVIDER" && !actor.ctx.permissions.includes("provider.users.manage")) return fail("FORBIDDEN", "You do not have permission to invite staff.");
    const target = await prisma.user.findFirst({
      where: { id: userId, tenantId: scope.tenantId, ...(actor.kind === "PROVIDER" ? { providerId: scope.providerId, role: "PROVIDER_USER" } : {}) },
      select: { id: true, email: true, firstName: true, isActive: true, mustChangePassword: true, providerId: true, role: true },
    });
    if (!target) return fail("NOT_FOUND", "User not found.");
    if (!target.isActive) return fail("NOT_PENDING", "This account is suspended. Reactivate it before sending a setup link.");
    if (!target.mustChangePassword) return fail("NOT_PENDING", "This account has already been set up. If the person cannot sign in, use password reset.");
    return issueNewLink(target, { issuedVia: "RESEND", actorId: scope.actorId, module: scope.module, tenantId: scope.tenantId });
  },

  /**
   * P05.01 step 6 / P05.03 step 4 — the invitee asks for a new link from an
   * expired or used one. The answer never varies: nothing reveals whether the
   * address has an account. Only accounts already invited through this service
   * (never set up) are eligible; an account from the old temporary-password
   * process is re-invited by an administrator, deliberately.
   */
  async requestNewLink(rawEmail: unknown): Promise<void> {
    const email = normalizeEmail(rawEmail);
    if (!EMAIL_RE.test(email) || email.length > 254) return;
    const emailHash = sha256(email);
    if (await throttled(prisma, { emailHash }, INVITATION_RATE_LIMITS.perAddressPerHour)) return;
    const targets = await prisma.user.findMany({
      where: { email, isActive: true, mustChangePassword: true, accountSetupInvitations: { some: {} } },
      select: { id: true, email: true, firstName: true, isActive: true, mustChangePassword: true, providerId: true, role: true, tenantId: true },
      take: 5,
    });
    for (const t of targets) {
      await issueNewLink(t, { issuedVia: "SELF_SERVICE", actorId: null, module: "AUTH", tenantId: t.tenantId }).catch(() => undefined);
    }
  },

  /** Is this link usable right now? A single yes/no — nothing about the account. */
  async checkToken(rawToken: unknown): Promise<boolean> {
    return (await usableInvitation(rawToken)) !== null;
  },

  /** P05.03 — set the password, spend the link, and audit, in one transaction. */
  async completeSetup(rawToken: unknown, password: unknown, confirm: unknown): Promise<{ ok: true } | { ok: false; code: "INVALID_LINK" | "PASSWORD"; message: string }> {
    const invitation = await usableInvitation(rawToken);
    if (!invitation) return { ok: false, code: "INVALID_LINK", message: SETUP_LINK_INVALID_MESSAGE };
    const pw = typeof password === "string" ? password : "";
    const policy = validatePassword(pw);
    if (policy) return { ok: false, code: "PASSWORD", message: policy };
    if (pw !== confirm) return { ok: false, code: "PASSWORD", message: "The two passwords do not match." };

    const passwordHash = await bcrypt.hash(pw, PASSWORD_BCRYPT_COST);
    const now = new Date();
    try {
      await prisma.$transaction(async (tx) => {
        // Spend the link — conditionally, so two parallel submissions cannot both succeed.
        const spent = await tx.accountSetupInvitation.updateMany({
          where: { id: invitation.id, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
          data: { usedAt: now },
        });
        if (spent.count !== 1) throw new LinkNoLongerValid();
        const updated = await tx.user.updateMany({
          where: { id: invitation.userId, tenantId: invitation.tenantId, isActive: true },
          data: {
            passwordHash,
            mustChangePassword: false,
            sessionVersion: { increment: 1 },
            failedLoginCount: 0,
            lockedUntil: null,
            lastFailedLoginAt: null,
          },
        });
        if (updated.count !== 1) throw new LinkNoLongerValid();
        await tx.accountSetupInvitation.updateMany({
          where: { userId: invitation.userId, usedAt: null, revokedAt: null, id: { not: invitation.id } },
          data: { revokedAt: now, revokedReason: "ACCOUNT_SET_UP" },
        });
        await audit(tx, {
          tenantId: invitation.tenantId,
          actorId: invitation.userId,
          action: "ACCOUNT_SETUP_COMPLETED",
          module: "AUTH",
          entityId: invitation.userId,
          description: "Account set up from a one-time setup link; password set by the account holder",
          metadata: { invitationId: invitation.id, sessionsRevoked: true },
        });
      });
    } catch (e) {
      if (e instanceof LinkNoLongerValid) return { ok: false, code: "INVALID_LINK", message: SETUP_LINK_INVALID_MESSAGE };
      throw e;
    }
    captureEvent("invitation_activation", { invitationId: invitation.id, tenantId: invitation.tenantId, providerId: invitation.providerId, outcome: "ACTIVATED" });
    return { ok: true };
  },

  /** The latest link's state for each account, for the administration lists (never the token). */
  async stateFor(tenantId: string, userIds: string[]): Promise<Map<string, InvitationState>> {
    const out = new Map<string, InvitationState>();
    if (userIds.length === 0) return out;
    const rows = await prisma.accountSetupInvitation.findMany({
      where: { tenantId, userId: { in: userIds } },
      orderBy: { createdAt: "desc" },
      select: { userId: true, createdAt: true, lastAttemptAt: true, expiresAt: true, usedAt: true, revokedAt: true, deliveryStatus: true, failureClass: true },
    });
    const now = Date.now();
    for (const r of rows) {
      if (out.has(r.userId)) continue; // newest first
      const status: InvitationState["status"] = r.usedAt
        ? "USED"
        : r.revokedAt
          ? "REVOKED"
          : r.expiresAt.getTime() <= now
            ? "EXPIRED"
            : r.deliveryStatus;
      out.set(r.userId, { status, issuedAt: r.createdAt, lastAttemptAt: r.lastAttemptAt, expiresAt: r.expiresAt, failureClass: r.failureClass });
    }
    return out;
  },
} as const;

class LinkNoLongerValid extends Error {}

/** The invitation behind a raw token, if it can be used right now. */
async function usableInvitation(rawToken: unknown) {
  if (typeof rawToken !== "string" || !TOKEN_RE.test(rawToken)) return null;
  const row = await prisma.accountSetupInvitation.findUnique({
    where: { tokenHash: hashSetupToken(rawToken) },
    select: {
      id: true, tenantId: true, userId: true, providerId: true, expiresAt: true, usedAt: true, revokedAt: true,
      user: { select: { tenantId: true, isActive: true, mustChangePassword: true } },
    },
  });
  if (!row || row.usedAt || row.revokedAt || row.expiresAt.getTime() <= Date.now()) return null;
  // A suspended account, an account already set up another way, or a
  // tenant mismatch: all the same answer as an altered token.
  if (!row.user.isActive || !row.user.mustChangePassword || row.user.tenantId !== row.tenantId) return null;
  return row;
}

async function issueNewLink(
  target: { id: string; email: string; firstName: string; providerId: string | null; role: UserRole },
  how: { issuedVia: "RESEND" | "SELF_SERVICE"; actorId: string | null; module: string; tenantId: string },
): Promise<InvitationResult> {
  const emailHash = sha256(target.email.trim().toLowerCase());
  if (how.actorId && (await throttled(prisma, { invitedById: how.actorId }, INVITATION_RATE_LIMITS.perActorPerHour))) return fail("THROTTLED", "Too many invitations sent in the last hour. Try again later.");
  if (await throttled(prisma, { userId: target.id }, INVITATION_RATE_LIMITS.perUserPerHour)) return fail("THROTTLED", "Too many setup links for this account in the last hour. Try again later.");
  if (how.issuedVia !== "SELF_SERVICE" && (await throttled(prisma, { emailHash }, INVITATION_RATE_LIMITS.perAddressPerHour))) return fail("THROTTLED", "Too many setup links have gone to this address in the last hour. Try again later.");

  const passwordHash = await unusableSecretHash();
  const token = newToken();
  const expiresAt = new Date(Date.now() + SETUP_LINK_TTL_HOURS * 60 * 60 * 1000);
  const providerId = target.role === "PROVIDER_USER" ? target.providerId : null;
  const invitationId = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const revoked = await tx.accountSetupInvitation.updateMany({
      where: { userId: target.id, usedAt: null, revokedAt: null },
      data: { revokedAt: now, revokedReason: "SUPERSEDED" },
    });
    // A new unusable secret: any earlier temporary password stops working, and live sessions end.
    await tx.user.update({ where: { id: target.id }, data: { passwordHash, mustChangePassword: true, sessionVersion: { increment: 1 } } });
    const invitation = await tx.accountSetupInvitation.create({
      data: { tenantId: how.tenantId, userId: target.id, providerId, tokenHash: token.hash, emailHash, expiresAt, issuedVia: how.issuedVia, invitedById: how.actorId },
      select: { id: true },
    });
    await audit(tx, {
      tenantId: how.tenantId,
      actorId: how.actorId,
      action: how.issuedVia === "SELF_SERVICE" ? "ACCOUNT_SETUP_LINK_REQUESTED" : "ACCOUNT_SETUP_LINK_RESENT",
      module: how.module,
      entityId: target.id,
      description: how.issuedVia === "SELF_SERVICE" ? "New account setup link requested by the invitee" : "New account setup link issued; older links revoked",
      metadata: { invitationId: invitation.id, revokedLinks: revoked.count, expiresAt: expiresAt.toISOString(), providerId },
    });
    return invitation.id;
  });

  const facility = providerId ? await prisma.provider.findUnique({ where: { id: providerId }, select: { name: true } }) : null;
  const delivered = await deliver(
    { id: invitationId, tenantId: how.tenantId, providerId, userId: target.id },
    token.raw,
    { email: target.email, firstName: target.firstName },
    facility?.name ?? null,
    how.module,
    how.actorId,
  );
  return {
    ok: true,
    userId: target.id,
    invitationId,
    delivery: delivered.status,
    failureClass: delivered.failureClass,
    expiresAt,
    message: delivered.status === "SENT" ? `A new setup link was sent. It expires in ${SETUP_LINK_TTL_HOURS} hours.` : "A new setup link was created, but delivery failed — resend.",
  };
}
