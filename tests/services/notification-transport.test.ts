/**
 * Family Hospital UAT plan P05.02 step 3 — no Mailtrap / test-user / test-pass
 * fallback. Without SMTP_HOST, outside the test runner, a send is an explicit
 * configuration failure; with it, the configured host and credentials are used.
 */
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/queue", () => ({ enqueueEmail: vi.fn() }));
const nm = vi.hoisted(() => ({ createTransport: vi.fn(), sendMail: vi.fn(async () => ({})) }));
vi.mock("nodemailer", () => ({ createTransport: (opts: unknown) => { nm.createTransport(opts); return { sendMail: nm.sendMail }; } }));

import { NotificationService, EmailConfigurationError } from "@/server/services/notification.service";

const saved = { host: process.env.SMTP_HOST, port: process.env.SMTP_PORT, user: process.env.SMTP_USER, pass: process.env.SMTP_PASS, env: process.env.NODE_ENV };
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  for (const [k, v] of Object.entries({ SMTP_HOST: saved.host, SMTP_PORT: saved.port, SMTP_USER: saved.user, SMTP_PASS: saved.pass })) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  (process.env as Record<string, string | undefined>).NODE_ENV = saved.env;
});

describe("NotificationService transport", () => {
  it("refuses to send without SMTP_HOST outside tests — no sandbox fallback", async () => {
    delete process.env.SMTP_HOST;
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    await expect(NotificationService.executeEmailDispatch({ to: "a@x.test", subject: "s", body: "b" })).rejects.toBeInstanceOf(EmailConfigurationError);
    expect(nm.sendMail).not.toHaveBeenCalled();
    expect(JSON.stringify(nm.createTransport.mock.calls)).not.toMatch(/mailtrap|test-user|test-pass/);
  });

  it("uses the configured host, port and credentials", async () => {
    process.env.SMTP_HOST = "smtp.example.test";
    process.env.SMTP_PORT = "465";
    process.env.SMTP_USER = "mailer";
    process.env.SMTP_PASS = "secret";
    await NotificationService.executeEmailDispatch({ to: "a@x.test", subject: "s", body: "b" });
    expect(nm.createTransport).toHaveBeenCalledWith({ host: "smtp.example.test", port: 465, auth: { user: "mailer", pass: "secret" } });
    expect(nm.sendMail).toHaveBeenCalledTimes(1);
  });

  it("sends without auth when no credentials are configured (never test-user/test-pass)", async () => {
    process.env.SMTP_HOST = "relay.example.test";
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    await NotificationService.executeEmailDispatch({ to: "a@x.test", subject: "s", body: "b" });
    expect(nm.createTransport).toHaveBeenCalledWith({ host: "relay.example.test", port: 587 });
  });
});
