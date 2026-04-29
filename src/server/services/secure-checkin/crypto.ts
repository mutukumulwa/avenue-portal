import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export function randomBase64Url(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function generateVisitCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashesMatch(plainValue: string, expectedHash: string) {
  const actual = Buffer.from(sha256(plainValue), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + seconds * 1000);
}
