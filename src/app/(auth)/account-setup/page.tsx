import { AccountSetupForm } from "./AccountSetupForm";

/**
 * Family Hospital UAT plan P05.03 — set your own password from a one-time link.
 *
 * The link is `/account-setup#token=…`: the token is in the URL FRAGMENT, which
 * a browser never sends to the server, so it is absent from the request, from
 * access logs and from any Referer. This page renders nothing about the token;
 * the small client form reads it, removes it from the address bar at once
 * (`history.replaceState`), and hands it to a Server Action.
 */
export const metadata = { title: "Set up your account — Medvex", referrer: "no-referrer" };

export default function AccountSetupPage() {
  return (
    <div className="mx-auto mt-16 max-w-md px-4">
      <h1 className="font-heading text-2xl font-bold text-brand-text-heading">Set up your account</h1>
      <p className="mt-1 text-sm text-brand-text-muted">Choose the password you will use to sign in to Medvex.</p>
      <AccountSetupForm />
    </div>
  );
}
