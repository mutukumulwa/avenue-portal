# INT01 — Integration & notification testing status (mostly BLOCKED)

Per plan §9. Triggering integrations requires authenticated workflows and/or backend access — almost all are **BLOCKED** in this environment (no login, no DB, no worker, no mail/SMS/SMS-gateway/MinIO access). Recorded honestly below.

| Integration | Plan expectation | Status this run | Notes |
|---|---|---|---|
| **B2B API `/api/v1/*`** (Slade360) | 401 no/invalid key; **reject default dev key**; 403 ineligible | 🔴 **TESTED — FAIL** | Default dev key **accepted** in prod (DEF-001). No-key→401 OK. See [../workflows/WF08_b2b_api_auth.md](../workflows/WF08_b2b_api_auth.md). |
| **Email (SMTP/Nodemailer, queued)** | Real SMTP; mails deliver; not mailtrap default | ⛔ BLOCKED | Cannot trigger (no login) or inspect `Correspondence.status`/SMTP. Plan flags mailtrap default risk — unverified. |
| **M-Pesa (Daraja)** | STUB returns unverified; fake code must NOT mark paid | ⛔ BLOCKED | Confirmed STUB in source only; the **critical safety check** (fake code ≠ paid) needs the member wallet UI. |
| **IPRS (national ID)** | STUB returns valid; manual gate must be enforced | ⛔ BLOCKED | Confirmed STUB in source only; manual-verify gate unverified. |
| **SMS** | Real gateway wired; OTP/alerts deliver | ⛔ BLOCKED | Plan notes no confirmed gateway client. Untestable here. |
| **USSD** (`/api/ussd`) | Webhook serves menu; no data leak to unknown phone | ⚠️ NOT ATTEMPTED | POSTing simulated session payloads could create/read member-linked state; skipped to stay non-destructive without a staging tenant. |
| **MinIO storage** | Upload then retrieve | ⛔ BLOCKED | `/api/v1/upload` write path deliberately not exercised. |
| **PDF generation** (react-pdf/Puppeteer) | Letters/quotation/debit-note/board-pack/statements stream PDFs | ⛔ BLOCKED (high-risk) | Prior run: HTTP 500 (DEFECT-001/005). Needs auth to re-test; carry forward as **High** risk. |
| **Redis / BullMQ worker** | Jobs processed; degrade safely if down | ⛔ BLOCKED | No worker/Redis here. |

## Notification coverage matrix (§9)
**Not tested** — every event (member created, card issued, claim approved/declined, preauth decision, settlement, lapse, reinstatement, renewal reminder, SLA breach, fund-balance alert, fraud escalation) requires authenticated triggering and recipient inbox/`MemberNotification` inspection. Recorded as blocked.

## Readiness implication
The stub integrations (M-Pesa, IPRS) and the unconfirmed SMS gateway remain **go-live risks** per the plan and could not be cleared here. The one integration that **was** testable (B2B API) **failed** its security gate.
