export async function sendCheckInOtp() {
  return {
    ok: false,
    reason: "SMS provider is not configured. Africa's Talking is the expected future default.",
  } as const;
}
