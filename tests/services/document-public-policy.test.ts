/**
 * F2.9 — public-read posture flag.
 *
 * The bucket-creation policy must default to today's behaviour (public) so the
 * un-migrated admin/member/HR fileUrl consumers keep working, and must be
 * switchable to private-by-default once the §11.4 gate is signed off.
 */
import { describe, it, expect, afterEach } from "vitest";
import { publicDocumentsEnabled } from "@/lib/minio";

const original = process.env.MINIO_PUBLIC_DOCUMENTS;
afterEach(() => {
  if (original === undefined) delete process.env.MINIO_PUBLIC_DOCUMENTS;
  else process.env.MINIO_PUBLIC_DOCUMENTS = original;
});

describe("F2.9 publicDocumentsEnabled", () => {
  it("defaults to the legacy public behaviour when unset (no silent flip)", () => {
    delete process.env.MINIO_PUBLIC_DOCUMENTS;
    expect(publicDocumentsEnabled()).toBe(true);
  });

  it("only an explicit 'false' switches new buckets to private-by-default", () => {
    process.env.MINIO_PUBLIC_DOCUMENTS = "false";
    expect(publicDocumentsEnabled()).toBe(false);
    process.env.MINIO_PUBLIC_DOCUMENTS = "true";
    expect(publicDocumentsEnabled()).toBe(true);
    process.env.MINIO_PUBLIC_DOCUMENTS = "anything-else";
    expect(publicDocumentsEnabled()).toBe(true); // fail-safe: only "false" disables
  });
});
