// Statuses at which a provider may still cancel its OWN pre-authorisation (before
// it is used). Once a PA is ATTACHED/UTILISED/CONVERTED or already terminal, it is
// not provider-cancellable; cancelPreAuth also backstops terminal states.
//
// This lives in a plain module (not the "use server" actions.ts) because a
// "use server" file may only export async functions — a runtime const there fails
// the Next.js build.
export const PROVIDER_CANCELLABLE_STATUSES = ["SUBMITTED", "UNDER_REVIEW", "APPROVED"];
