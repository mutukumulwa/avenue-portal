"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { browserSupportsWebAuthn, platformAuthenticatorIsAvailable, startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/types";
import { Fingerprint } from "lucide-react";

type RegistrationOptionsResponse = PublicKeyCredentialCreationOptionsJSON | { error: string };
type VerifyResponse = { ok: true; credentialId: string; deviceName: string | null } | { error: string };

export function RegisterDeviceButton({ approvalToken }: { approvalToken?: string | null }) {
  const router = useRouter();
  const [deviceName, setDeviceName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function registerDevice() {
    setError(null);
    setMessage(null);

    startTransition(async () => {
      try {
        if (!browserSupportsWebAuthn()) {
          setError("This browser does not support secure device registration.");
          return;
        }

        const platformAvailable = await platformAuthenticatorIsAvailable();
        if (!platformAvailable) {
          setError("This device does not report a built-in biometric/passkey authenticator.");
          return;
        }

        const optionsResponse = await fetch("/api/member/security/webauthn/register/options", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approvalToken }),
        });
        const options = await optionsResponse.json() as RegistrationOptionsResponse;
        if ("error" in options) {
          setError(options.error);
          return;
        }

        const attestation = await startRegistration(options);
        const verifyResponse = await fetch("/api/member/security/webauthn/register/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            response: attestation,
            deviceName: deviceName.trim() || undefined,
            approvalToken,
          }),
        });
        const verify = await verifyResponse.json() as VerifyResponse;
        if ("error" in verify) {
          setError(verify.error);
          return;
        }

        setMessage("Device registered for secure check-in.");
        router.refresh();
      } catch (registrationError) {
        setError(registrationError instanceof Error ? registrationError.message : "Device registration failed.");
      }
    });
  }

  return (
    <div className="rounded-lg border border-[#EEEEEE] bg-white p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-avenue-indigo/10 text-avenue-indigo">
          <Fingerprint className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-avenue-text-heading">Register This Device</h2>
          <p className="mt-1 text-sm text-avenue-text-muted">
            Use your phone&apos;s Face ID, fingerprint, or passkey prompt to register this device for secure check-in.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              value={deviceName}
              onChange={(event) => setDeviceName(event.target.value)}
              placeholder="Device name, e.g. Arthur's iPhone"
              className="w-full rounded-md border border-[#EEEEEE] px-3 py-2 text-sm outline-none focus:border-avenue-indigo"
            />
            <button
              type="button"
              onClick={registerDevice}
              disabled={pending}
              className="rounded-full bg-avenue-indigo px-5 py-2 text-sm font-bold text-white hover:bg-avenue-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Registering..." : "Register"}
            </button>
          </div>
          {message && <p className="mt-3 text-sm font-semibold text-green-700">{message}</p>}
          {error && <p className="mt-3 text-sm font-semibold text-avenue-error">{error}</p>}
        </div>
      </div>
    </div>
  );
}
