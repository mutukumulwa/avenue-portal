"use client";

import { createContext, useContext } from "react";

/**
 * Frontend consumption of the terminology engine (G2.4 slice 4).
 *
 * The admin layout resolves the key→displayText map for the current
 * tenant/client/locale (TerminologyService.getMap) and provides it here.
 * Client components read client-specific vocabulary via useTerm(); server
 * components can call TerminologyService.resolve() directly instead.
 */
const TermContext = createContext<Record<string, string>>({});

export function TermProvider({
  value,
  children,
}: {
  value: Record<string, string>;
  children: React.ReactNode;
}) {
  return <TermContext.Provider value={value}>{children}</TermContext.Provider>;
}

/**
 * Resolve a canonical term key to its display text for the current context.
 * Falls back to `fallback` (a sensible default label), then to the key itself.
 *
 *   const policyWord = useTerm("policy", "Policy");
 */
export function useTerm(key: string, fallback?: string): string {
  const map = useContext(TermContext);
  return map[key] ?? fallback ?? key;
}
