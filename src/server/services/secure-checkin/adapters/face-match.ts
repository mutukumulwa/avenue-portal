export async function compareCheckInPhoto() {
  return {
    ok: false,
    reason: "Face-match vendor is not configured for this build.",
  } as const;
}
