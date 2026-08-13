/**
 * UAT-HF P03.06 — run the canonical eligibility table across every audience.
 *
 * "Release fails if authoring projection, member display, provider decision,
 * and claim/preauth enforcement disagree."
 *
 * Run:
 *   npx tsx scripts/policy-parity-gate.ts            # report
 *   npx tsx scripts/policy-parity-gate.ts --release  # non-zero on any gap
 *
 * The logic is in `src/lib/policy-parity.ts` so it can be unit-tested; this is
 * only the report. It exits non-zero in `--release` mode when any audience
 * DISAGREES **or** is NOT CONSULTED — a surface that never asks the question
 * cannot be counted as agreeing with the answer.
 */

import { runPolicyParity, CANONICAL_POLICY_CASES } from "../src/lib/policy-parity";

const RELEASE = process.argv.includes("--release");

const { results, mismatches, passed } = runPolicyParity();

console.log("\nUAT-HF P03.06 — policy parity across the four audiences\n");
console.log(`  Canonical cases: ${CANONICAL_POLICY_CASES.length}\n`);

for (const r of results) {
  const tag =
    r.verdict === "AGREES" ? "✅ AGREES      " :
    r.verdict === "DISAGREES" ? "❌ DISAGREES   " :
    "⚠️  NOT CONSULTED";
  console.log(`  ${tag}  ${r.audience}`);
  if (r.note) console.log(`      ${r.note}`);
}

if (mismatches.length > 0) {
  console.log(`\n  ${mismatches.length} finding(s):\n`);
  for (const m of mismatches) console.log(`    • ${m}`);
}

if (passed) {
  console.log("\n  All four audiences answer the canonical table identically.\n");
} else {
  console.log(
    "\n  Parity is NOT established. Two audiences do not consult the shared policy\n" +
      "  read model at all, so the same member can be told three different things\n" +
      "  about when a benefit becomes usable. This is a finding, not a test bug —\n" +
      "  do not silence it by narrowing the audience list.\n",
  );
}

process.exitCode = RELEASE && !passed ? 1 : 0;
