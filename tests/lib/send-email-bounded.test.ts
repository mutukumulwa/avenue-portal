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

import { sendEmailNowBounded } from "@/lib/queue";

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
