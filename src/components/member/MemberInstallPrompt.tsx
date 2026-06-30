"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISSED_KEY = "aicare-member-install-dismissed-v2";

function isStandaloneMode() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator && window.navigator.standalone === true)
  );
}

function isIosSafari() {
  const ua = window.navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua);
  const isWebkit = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
  return isIos && isWebkit;
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 767px)").matches;
}

function installInstructions() {
  const ua = window.navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) {
    return "Open the browser share menu, then choose Add to Home Screen.";
  }
  return "Open your browser menu, then choose Install app or Add to Home screen.";
}

export function MemberInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [manualHint, setManualHint] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandaloneMode()) return;
    if (window.localStorage.getItem(DISMISSED_KEY) === "true") return;

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);

    const hintFrame = (isMobileViewport() || isIosSafari())
      ? window.requestAnimationFrame(() => {
          setManualHint(true);
          setVisible(true);
        })
      : null;

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      if (hintFrame !== null) window.cancelAnimationFrame(hintFrame);
    };
  }, []);

  const dismiss = () => {
    window.localStorage.setItem(DISMISSED_KEY, "true");
    setVisible(false);
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") {
      window.localStorage.setItem(DISMISSED_KEY, "true");
      setVisible(false);
    }
    setInstallEvent(null);
  };

  if (!visible || (!installEvent && !manualHint)) return null;

  return (
    <section className="mb-4 rounded-[8px] border border-avenue-indigo/15 bg-white p-4 shadow-sm md:hidden">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-avenue-indigo/10 text-avenue-indigo">
          {installEvent ? <Download className="h-5 w-5" /> : <Share className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-heading font-bold text-avenue-text-heading">Add Medvex to your home screen</p>
          <p className="mt-1 text-sm leading-relaxed text-avenue-text-muted">
            {installEvent
              ? "Install the member portal for faster access from your phone."
              : installInstructions()}
          </p>
          {installEvent && (
            <button
              type="button"
              onClick={install}
              className="mt-3 inline-flex items-center gap-2 rounded-[8px] bg-avenue-indigo px-3 py-2 text-sm font-semibold text-white"
            >
              <Download className="h-4 w-4" />
              Install app
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-avenue-text-muted hover:bg-[#F8F9FA]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
