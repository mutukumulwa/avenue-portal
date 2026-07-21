import { describe, it, expect, vi } from "vitest";
import { createWithDocumentNumber, peekNextDocumentNumber } from "@/lib/document-number";

/**
 * B4 — collision-safe document numbering. The helper is pure logic over two
 * injected callbacks (findLatest + create), so it tests without a DB.
 */

const YEAR = new Date().getFullYear();
const p2002 = () => Object.assign(new Error("Unique constraint failed"), { code: "P2002" });

describe("createWithDocumentNumber", () => {
  it("allocates NNNNN=00001 when no rows exist for the year", async () => {
    const create = vi.fn(async (n: string) => n);
    const out = await createWithDocumentNumber("CLM", async () => null, create);
    expect(out).toBe(`CLM-${YEAR}-00001`);
    expect(create).toHaveBeenCalledExactlyOnceWith(`CLM-${YEAR}-00001`);
  });

  it("seeds from max(existing suffix)+1, NOT count()+1 (the post-purge fix)", async () => {
    // The DB has ONE row left after a purge, but its number is high (00042).
    // count()+1 would produce 00002 and collide; max+1 must produce 00043.
    const create = vi.fn(async (n: string) => n);
    const out = await createWithDocumentNumber("CASE", async () => `CASE-${YEAR}-00042`, create);
    expect(out).toBe(`CASE-${YEAR}-00043`);
    expect(create).toHaveBeenCalledExactlyOnceWith(`CASE-${YEAR}-00043`);
  });

  it("advances past a concurrent collision (P2002) to the next candidate", async () => {
    const taken = new Set([`PA-${YEAR}-00010`]); // a concurrent writer grabbed 00010
    const create = vi.fn(async (n: string) => {
      if (taken.has(n)) throw p2002();
      return n;
    });
    const out = await createWithDocumentNumber("PA", async () => `PA-${YEAR}-00009`, create);
    expect(out).toBe(`PA-${YEAR}-00011`);
    expect(create).toHaveBeenNthCalledWith(1, `PA-${YEAR}-00010`);
    expect(create).toHaveBeenNthCalledWith(2, `PA-${YEAR}-00011`);
  });

  it("rethrows a non-P2002 error immediately without retrying", async () => {
    const create = vi.fn(async () => {
      throw new Error("some other failure");
    });
    await expect(createWithDocumentNumber("CLM", async () => null, create)).rejects.toThrow(
      "some other failure",
    );
    expect(create).toHaveBeenCalledOnce();
  });

  it("gives up with a retry-able error after 50 attempts of sustained collision", async () => {
    const create = vi.fn(async () => {
      throw p2002();
    });
    await expect(createWithDocumentNumber("CLM", async () => null, create)).rejects.toThrow(
      /Could not allocate a unique CLM number after 50 attempts/,
    );
    expect(create).toHaveBeenCalledTimes(50);
  });

  it("treats a Prisma-shaped P2002 (code on the error) as a collision", async () => {
    let first = true;
    const create = vi.fn(async (n: string) => {
      if (first) {
        first = false;
        throw Object.assign(new Error("dup"), { code: "P2002" });
      }
      return n;
    });
    const out = await createWithDocumentNumber("LOU", async () => `LOU-${YEAR}-00001`, create);
    expect(out).toBe(`LOU-${YEAR}-00003`);
  });
});

describe("peekNextDocumentNumber", () => {
  it("returns NNNNN=00001 when none exist", async () => {
    expect(await peekNextDocumentNumber("CLM", async () => null)).toBe(`CLM-${YEAR}-00001`);
  });

  it("returns max(existing suffix)+1 (post-purge safe seed, no retry)", async () => {
    expect(await peekNextDocumentNumber("CLM", async () => `CLM-${YEAR}-00099`)).toBe(
      `CLM-${YEAR}-00100`,
    );
  });

  it("passes the correct year-prefix to the finder", async () => {
    const finder = vi.fn(async () => null);
    await peekNextDocumentNumber("CASE", finder);
    expect(finder).toHaveBeenCalledWith(`CASE-${YEAR}-`);
  });
});
