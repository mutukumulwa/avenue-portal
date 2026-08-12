"use client";

/**
 * UAT-HF P04.02 — "success and logout purge them".
 *
 * Mounted on the sign-in page rather than in each sign-out handler. There are
 * six of those (one per sidebar/nav) plus the `/signout` route and the session-
 * expiry redirect, and every one of them lands here; a purge in six places is
 * six chances to add a seventh and forget.
 *
 * Arriving at sign-in means nobody is authenticated in this tab, so no draft
 * from a previous session may survive into the next one — the next person to
 * sign in at a shared desk must not be handed the last one's typed PII.
 */

import { useEffect } from "react";
import { DraftStore } from "@/lib/draft-store";

export function DraftPurgeOnSignOut() {
  useEffect(() => {
    DraftStore.purgeAll();
  }, []);
  return null;
}
