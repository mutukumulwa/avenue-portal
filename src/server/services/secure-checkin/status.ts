import type { CheckInChallengeStatus } from "@prisma/client";

export function describeCheckInStatus(status: CheckInChallengeStatus, hasVisit: boolean) {
  if (hasVisit) {
    return {
      tone: "success" as const,
      title: "Visit opened",
      nextAction: "No further reception action is needed for this check-in.",
    };
  }

  switch (status) {
    case "PENDING":
      return {
        tone: "info" as const,
        title: "Waiting for member",
        nextAction: "Ask the member to open Check-In on their phone, scan/pull the request, or use fallback if they cannot access the device.",
      };
    case "SIGNED":
      return {
        tone: "success" as const,
        title: "Member verified",
        nextAction: "Compare the 6-digit code on the member phone with the reception screen and confirm match.",
      };
    case "EXPIRED":
      return {
        tone: "warning" as const,
        title: "Expired",
        nextAction: "Restart the check-in if the member is still at reception.",
      };
    case "FAILED":
      return {
        tone: "danger" as const,
        title: "Failed",
        nextAction: "Restart check-in, use fallback, or emergency override only if clinically necessary.",
      };
    case "FALLBACK_STARTED":
      return {
        tone: "warning" as const,
        title: "Fallback in progress",
        nextAction: "Complete the knowledge fallback or restart if the member can return to biometric check-in.",
      };
    case "CANCELLED":
      return {
        tone: "muted" as const,
        title: "Cancelled",
        nextAction: "Restart check-in only if the member still needs to be seen.",
      };
    case "CODE_CONFIRMED":
      return {
        tone: "success" as const,
        title: "Code confirmed",
        nextAction: "Visit verification should now be open.",
      };
    default:
      return {
        tone: "muted" as const,
        title: String(status).replace(/_/g, " "),
        nextAction: "Review audit trail for next action.",
      };
  }
}
