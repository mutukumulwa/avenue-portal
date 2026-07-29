/**
 * PNOS F2.4 — content-based MIME detection (magic bytes, not extension), §9.9.
 *
 * Pure, dependency-free. detectMimeType inspects leading bytes; a value the
 * detector cannot place returns null (treated as unacceptable). Office Open XML
 * (docx/xlsx) is ZIP-framed and legacy doc/xls is OLE/CFB — those resolve to a
 * container label that isContentTypeAcceptable maps back to the declared type
 * only when the declared type is a matching office format in the allowlist.
 */

export type DetectedContainer =
  | "application/pdf"
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "application/zip" // docx/xlsx (OOXML) framing
  | "application/x-ole-storage" // legacy doc/xls (CFB) framing
  | null;

function startsWith(buf: Buffer, sig: number[], offset = 0): boolean {
  if (buf.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (buf[offset + i] !== sig[i]) return false;
  return true;
}

/** Detect a container type from magic bytes, or null if unrecognised. */
export function detectMimeType(buf: Buffer): DetectedContainer {
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46])) return "application/pdf"; // %PDF
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp"; // RIFF....WEBP
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04]) || startsWith(buf, [0x50, 0x4b, 0x05, 0x06]) || startsWith(buf, [0x50, 0x4b, 0x07, 0x08])) return "application/zip"; // PK
  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "application/x-ole-storage"; // CFB
  return null;
}

const OOXML_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const OLE_TYPES = new Set(["application/msword", "application/vnd.ms-excel"]);

/**
 * Is the object's actual content acceptable for the declared MIME within the
 * policy allowlist? Detected-vs-declared must be consistent (defeats an
 * extension/MIME lie) and the resolved type must be in `allowedMimes`.
 * Returns the canonical detected MIME to store, or null to reject.
 */
export function resolveAcceptableMime(buf: Buffer, declaredMime: string | undefined, allowedMimes: string[]): string | null {
  const detected = detectMimeType(buf);
  if (!detected) return null; // unknown/forged content
  const allow = new Set(allowedMimes);

  if (detected === "application/pdf" || detected === "image/png" || detected === "image/jpeg" || detected === "image/webp") {
    return allow.has(detected) ? detected : null;
  }
  if (detected === "application/zip") {
    // OOXML: the declared type must be a docx/xlsx that is allowed.
    if (declaredMime && OOXML_TYPES.has(declaredMime) && allow.has(declaredMime)) return declaredMime;
    return null;
  }
  if (detected === "application/x-ole-storage") {
    if (declaredMime && OLE_TYPES.has(declaredMime) && allow.has(declaredMime)) return declaredMime;
    return null;
  }
  return null;
}
