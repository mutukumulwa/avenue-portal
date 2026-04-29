"use client";

import { useActionState, useState, useTransition } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/types";
import { CheckCircle2, Fingerprint } from "lucide-react";
import { acknowledgeMemberCheckInAction, type MemberCheckInActionState } from "./actions";

type PendingCheckIn = {
  id: string;
  challengeId: string;
  title: string;
  body: string;
  expiresAt: Date;
  challenge: {
    provider: { name: string; county: string | null };
    initiatedBy: { firstName: string; lastName: string };
  };
};

type BiometricOptionsResponse = PublicKeyCredentialRequestOptionsJSON | { error: string };
type BiometricVerifyResponse =
  | { ok: true; visitCode: string; providerName: string; expiresAt: string }
  | { error: string };

export function MemberCheckInCard({
  notification,
  hasBiometricCredential,
  highlighted = false,
}: {
  notification: PendingCheckIn;
  hasBiometricCredential: boolean;
  highlighted?: boolean;
}) {
  const [state, formAction, pending] = useActionState<MemberCheckInActionState, FormData>(
    acknowledgeMemberCheckInAction,
    {}
  );
  const [biometricState, setBiometricState] = useState<MemberCheckInActionState>({});
  const [biometricError, setBiometricError] = useState<string | null>(null);
  const [biometricPending, startBiometricTransition] = useTransition();

  const resolvedState = biometricState.visitCode ? biometricState : state;

  function verifyBiometrically() {
    setBiometricError(null);
    setBiometricState({});

    startBiometricTransition(async () => {
      try {
        const optionsResponse = await fetch("/api/member/check-in/webauthn/options", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ challengeId: notification.challengeId }),
        });
        const options = await optionsResponse.json() as BiometricOptionsResponse;
        if ("error" in options) {
          setBiometricError(options.error);
          return;
        }

        const assertion = await startAuthentication(options);
        const verifyResponse = await fetch("/api/member/check-in/webauthn/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            challengeId: notification.challengeId,
            response: assertion,
          }),
        });
        const verify = await verifyResponse.json() as BiometricVerifyResponse;
        if ("error" in verify) {
          setBiometricError(verify.error);
          return;
        }

        setBiometricState({
          visitCode: verify.visitCode,
          providerName: verify.providerName,
          expiresAt: verify.expiresAt,
        });
      } catch (error) {
        setBiometricError(error instanceof Error ? error.message : "Biometric check-in failed.");
      }
    });
  }

  if (resolvedState.visitCode) {
    return (
      <div className="rounded-lg border border-green-100 bg-green-50 p-5 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-green-700" />
        <p className="mt-3 text-sm font-bold text-green-800">Show this code to reception</p>
        <p className="mt-2 font-heading text-5xl font-bold tracking-widest text-green-900">{resolvedState.visitCode}</p>
        <p className="mt-2 text-xs text-green-700">
          {resolvedState.providerName} - expires at {resolvedState.expiresAt ? new Date(resolvedState.expiresAt).toLocaleTimeString() : "soon"}
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border bg-white p-5 ${highlighted ? "border-avenue-indigo ring-2 ring-avenue-indigo/15" : "border-[#EEEEEE]"}`}>
      <p className="text-xs font-bold uppercase text-avenue-text-muted">Pending check-in</p>
      <h2 className="mt-1 font-bold text-avenue-text-heading">{notification.challenge.provider.name}</h2>
      <p className="mt-1 text-sm text-avenue-text-muted">{notification.body}</p>
      <p className="mt-2 text-xs text-avenue-text-muted">
        Requested by {notification.challenge.initiatedBy.firstName} {notification.challenge.initiatedBy.lastName}. Expires at {notification.expiresAt.toLocaleTimeString()}.
      </p>

      {hasBiometricCredential && (
        <button
          type="button"
          onClick={verifyBiometrically}
          disabled={biometricPending}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-avenue-indigo px-5 py-2 text-sm font-bold text-white hover:bg-avenue-secondary disabled:opacity-50"
        >
          <Fingerprint className="h-4 w-4" />
          {biometricPending ? "Verifying..." : "Verify with biometrics"}
        </button>
      )}

      <form action={formAction} className="mt-4">
        <input type="hidden" name="challengeId" value={notification.challengeId} />
        <button disabled={pending} className="rounded-full border border-[#DDDDDD] px-5 py-2 text-sm font-bold text-avenue-text-body hover:bg-avenue-bg-alt disabled:opacity-50">
          {pending ? "Confirming..." : hasBiometricCredential ? "Use in-app fallback" : "I am at reception"}
        </button>
      </form>
      {biometricError && <p className="mt-3 text-sm font-semibold text-avenue-error">{biometricError}</p>}
      {state.error && <p className="mt-3 text-sm font-semibold text-avenue-error">{state.error}</p>}
    </div>
  );
}
