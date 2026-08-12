"use client"; // Error boundaries must be Client Components.

/**
 * UAT-HF P01.04 — last-resort boundary for a failure in the ROOT LAYOUT itself.
 *
 * This file replaces the root layout when active, so per the version-matched docs
 * it must supply its own `<html>` and `<body>`, cannot export `metadata` (use
 * React's `<title>` instead), and cannot assume the app's fonts or shell exist.
 *
 * It therefore carries inline styles rather than Tailwind classes: if the root
 * layout failed, the stylesheet it imports may be exactly what is missing, and a
 * blank white page is what the run described in DEF-050 — "no UI recovery path".
 *
 * See docs/vendor/nextjs-15.5.15/01-app/03-api-reference/03-file-conventions/error.mdx
 */
import { useEffect } from "react";
import { reportBoundaryError } from "@/components/errors/ErrorRecovery";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportBoundaryError(error, "root-layout");
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#ffffff",
          color: "#0B1437",
        }}
      >
        <title>Something went wrong — Medvex</title>
        <main role="alert" style={{ maxWidth: "32rem", padding: "2rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 0.5rem" }}>Medvex could not start</h1>
          <p style={{ margin: "0 0 1.5rem", lineHeight: 1.5 }}>
            The application failed to load. Nothing you were doing has been saved or changed.
          </p>

          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                background: "#0B1437",
                color: "#fff",
                border: 0,
                borderRadius: 9999,
                padding: "0.5rem 1.5rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {/*
              A plain anchor, not next/link: this boundary replaces the root
              layout, so the router is part of what may have failed. next/link
              would perform a client-side transition through the very machinery
              that just crashed; a full document load is the recovery.

              eslint-disable-next-line is deliberate and scoped to this one link.
            */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                border: "1px solid #DDDDDD",
                borderRadius: 9999,
                padding: "0.5rem 1.5rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "#0B1437",
                textDecoration: "none",
              }}
            >
              Reload Medvex
            </a>
          </div>

          {error.digest && (
            <p style={{ marginTop: "1.5rem", fontSize: "0.75rem", color: "#6B7280" }}>
              Reference <code style={{ fontFamily: "ui-monospace, monospace" }}>{error.digest}</code> — quote this to
              support.
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
