#!/usr/bin/env node
/**
 * Generate a strong, random operator API key for the B2B /api/v1 surface (BD-06).
 *
 * The operator key is environment-only: it lives in the platform's env settings
 * (Vercel / `.env`), NEVER in git. This script only PRINTS a fresh value — it
 * writes nothing to disk — so the secret never lands in a tracked file.
 *
 * Usage:
 *   node scripts/generate-api-key.mjs [envLabel]
 *     envLabel  optional tag baked into the prefix (default: "uat"), e.g. prod.
 *
 * Then set it wherever the app reads env from:
 *   - Vercel:  Project → Settings → Environment Variables → API_KEY  (all envs)
 *              or:  vercel env add API_KEY production
 *   - Local:   put `API_KEY="<value>"` in .env
 *
 * Rotation is just re-running this and replacing the value; the old key dies the
 * moment the new one is live (constant-time exact match, no default fallback).
 */
import { randomBytes } from "node:crypto";

const label = (process.argv[2] || "uat").toLowerCase().replace(/[^a-z0-9]/g, "");
// Prefix mirrors the per-facility "mvxk_" convention: "mvxo_" = Medvex operator.
const key = `mvxo_${label}_${randomBytes(32).toString("base64url")}`;

console.log("\nStrong operator API key (set as API_KEY — do NOT commit):\n");
console.log(`  ${key}\n`);
console.log("Set it, then redeploy so the new value is live. Examples:");
console.log("  vercel env add API_KEY production   # paste the value above");
console.log(`  echo 'API_KEY="${key}"' >> .env      # local dev only\n`);
