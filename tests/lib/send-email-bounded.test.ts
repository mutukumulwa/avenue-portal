/**
 * DEF-003 — sendEmailNowBounded must be terminal: it resolves { delivered:false }
 * (never throws, never hangs) when the SMTP dispatch exceeds the timeout. This is
 * what makes the reset request return in bounded time even with SMTP unreachable.
 *
 * The REAL helper runs here; only the underlying dispatch is mocked.
 */
import { describe, it, expect, vi } from "vitest";

const notifMock = vi.hoisted(() => ({ executeEmailDispatch: vi.fn() }));
vi.mock("@/server/services/notification.service", () => ({
  NotificationService: notifMock,
}));

import { classifyEmailError, sendEmailBounded, sendEmailNowBounded } from "@/lib/queue";

describe("sendEmailNowBounded", () => {
  it("resolves { delivered:false } when the dispatch never settles (timeout wins)", async () => {
    // A dispatch that never resolves — only the internal timeout can end the race.
    notifMock.executeEmailDispatch.mockReturnValue(new Promise(() => {}));

    const res = await sendEmailNowBounded(
      { to: "a@x.com", subject: "s", body: "b" },
      10, // tiny timeout so the test is fast
    );

    expect(res).toEqual({ delivered: false });
  });

  it("resolves { delivered:true } on a successful dispatch and never throws", async () => {
    notifMock.executeEmailDispatch.mockResolvedValue(undefined);

    const res = await sendEmailNowBounded({ to: "a@x.com", subject: "s", body: "b" });

    expect(res).toEqual({ delivered: true });
  });

  it("resolves { delivered:false } (does not throw) when the dispatch rejects", async () => {
    notifMock.executeEmailDispatch.mockRejectedValue(new Error("smtp-refused"));

    await expect(
      sendEmailNowBounded({ to: "a@x.com", subject: "s", body: "b" }, 1000),
    ).resolves.toEqual({ delivered: false });
  });
});


describe("Family Hospital UAT P05.02 — a failed send has a SAFE class, never provider text", () => {
  it.each([
    [Object.assign(new Error("SMTP is not configured"), { name: "EmailConfigurationError" }), "CONFIG"],
    [new Error("email-timeout"), "TIMEOUT"],
    [Object.assign(new Error("Invalid login: 535"), { code: "EAUTH" }), "AUTH"],
    [Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNECTION" }), "CONNECTION"],
    [Object.assign(new Error("550 5.1.1 <someone@x> unknown"), { responseCode: 550 }), "REJECTED"],
    [new Error("weird"), "UNKNOWN"],
  ])("%s → %s", (err, cls) => {
    expect(classifyEmailError(err)).toBe(cls);
  });

  it("sendEmailBounded reports the class and never throws", async () => {
    notifMock.executeEmailDispatch.mockRejectedValue(Object.assign(new Error("550 5.1.1 <someone@x> unknown"), { responseCode: 550 }));
    await expect(sendEmailBounded({ to: "a@x.com", subject: "s", body: "b" }, 1000)).resolves.toEqual({ delivered: false, failureClass: "REJECTED" });
  });
});
