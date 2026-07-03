import { describe, it, expect } from "vitest";
import { encryptPack, decryptPack, type OfflinePackPayload } from "@/server/services/offline-pack.service";

const payload: OfflinePackPayload = {
  packVersion: 1,
  providerId: "prov1",
  generatedAt: new Date().toISOString(),
  validUntil: new Date(Date.now() + 86_400_000).toISOString(),
  roster: [{ memberNumber: "MBR-001", firstName: "Jane", lastName: "Wanjiru", status: "ACTIVE" }],
  balances: [{ memberNumber: "MBR-001", category: "OUTPATIENT", limit: 100_000, remaining: 60_000 }],
  tariffs: [{ code: "SER001", name: "GP Consultation", rate: 1_000, currency: "UGX", requiresPreauth: false }],
};

describe("offline pack envelope (WP-B3 / D3 — AES-256-GCM, key from work code)", () => {
  it("round-trips with the correct code", () => {
    const env = encryptPack("OWA-ACD234", payload);
    const out = decryptPack("OWA-ACD234", env.ciphertext, env.iv, env.authTag);
    expect(out).toEqual(payload);
  });

  it("is case-insensitive on the code (phone read-out tolerance)", () => {
    const env = encryptPack("OWA-ACD234", payload);
    const out = decryptPack("owa-acd234", env.ciphertext, env.iv, env.authTag);
    expect(out.roster[0].memberNumber).toBe("MBR-001");
  });

  it("a wrong code cannot decrypt (auth tag failure)", () => {
    const env = encryptPack("OWA-ACD234", payload);
    expect(() => decryptPack("OWA-XXXXXX", env.ciphertext, env.iv, env.authTag)).toThrow();
  });

  it("ciphertext contains no plaintext fragments (stored-at-rest check)", () => {
    const env = encryptPack("OWA-ACD234", payload);
    const hex = env.ciphertext.toString("utf8");
    expect(hex).not.toContain("MBR-001");
    expect(hex).not.toContain("Wanjiru");
  });

  it("uses a fresh salt per pack — same input, different ciphertext", () => {
    const a = encryptPack("OWA-ACD234", payload);
    const b = encryptPack("OWA-ACD234", payload);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });
});
