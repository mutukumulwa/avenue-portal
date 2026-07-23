#!/usr/bin/env bash
# F7.6 Story 3 — B2B API story against PRODUCTION (policies OFF/SHADOW).
# Usage: API_KEY=mvxk_... [BASE=https://avenue-portal.vercel.app] [MEMBER=NWSC-2026-00250] bash b2b-story.sh
# Writes a redacted transcript to stdout — tee it into the run's evidence dir.
set -euo pipefail
BASE="${BASE:-https://avenue-portal.vercel.app}"
MEMBER="${MEMBER:-NWSC-2026-00250}"
: "${API_KEY:?set API_KEY=mvxk_... (mint via admin UI; never commit it)}"
RUN="$(date +%s)"
KEY_HDR="authorization: Bearer ${API_KEY}"
BODY() { cat <<EOF
{"memberNumber":"${MEMBER}","serviceType":"OUTPATIENT","dateOfService":"$(date -v-2d +%Y-%m-%d 2>/dev/null || date -d '2 days ago' +%Y-%m-%d)","diagnoses":["J06.9"],"lineItems":[{"description":"UAT Story-3 consult","quantity":1,"unitCost":45000,"cptCode":"99213"}],"invoiceNumber":"INV-UAT-S3-${RUN}"}
EOF
}
say() { echo; echo "## $1"; }

echo "# Story 3 transcript — ${BASE} — $(date -u +%FT%TZ) (key redacted)"
say "1. ACCEPTED (fresh key uat-s3-${RUN})"
R1=$(curl -s -X POST "$BASE/api/v1/claims" -H 'content-type: application/json' -H "$KEY_HDR" -H "idempotency-key: uat-s3-${RUN}" -d "$(BODY)")
echo "$R1"
RECEIPT=$(echo "$R1" | python3 -c "import json,sys;print(json.load(sys.stdin).get('receiptId',''))" 2>/dev/null || true)

say "2. REPLAY (same key+payload) — SAME claim, duplicate:true"
curl -s -w "\nHTTP %{http_code}\n" -X POST "$BASE/api/v1/claims" -H 'content-type: application/json' -H "$KEY_HDR" -H "idempotency-key: uat-s3-${RUN}" -d "$(BODY)"

say "3. CONFLICT (same key, changed amount) — 409, original untouched"
curl -s -w "\nHTTP %{http_code}\n" -X POST "$BASE/api/v1/claims" -H 'content-type: application/json' -H "$KEY_HDR" -H "idempotency-key: uat-s3-${RUN}" -d "$(BODY | sed 's/45000/99000/')"

say "4. RECEIPT LOOKUP — authoritative state + nextAction"
curl -s -w "\nHTTP %{http_code}\n" "$BASE/api/v1/claims/receipts/${RECEIPT}" -H "$KEY_HDR"

say "5. UNKNOWN RECEIPT — non-enumerating 404 (miss is chain-audited)"
curl -s -w "\nHTTP %{http_code}\n" "$BASE/api/v1/claims/receipts/cmzzzzzzzzzzzzzzzzzzzzzzz" -H "$KEY_HDR"

say "6. NO KEY — 401"
curl -s -w "HTTP %{http_code}\n" -o /dev/null -X POST "$BASE/api/v1/claims" -H 'content-type: application/json' -d "$(BODY)"

say "7. MISSING IDEMPOTENCY KEY — 422 IDEMPOTENCY_KEY_REQUIRED"
curl -s -w "\nHTTP %{http_code}\n" -X POST "$BASE/api/v1/claims" -H 'content-type: application/json' -H "$KEY_HDR" -d "$(BODY)"
echo
echo "# End. Verify in-app: the claim appears in the Aga Khan provider list + admin queues."
