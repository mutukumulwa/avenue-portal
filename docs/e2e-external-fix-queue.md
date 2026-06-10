# E2E External-System Fix Queue

These items require vendor credentials, network endpoints, production infrastructure, or operational setup outside the codebase before they can be completed end to end.

## Payment And Proofing

- M-Pesa member wallet checkout: replace simulated checkout IDs with a real Daraja STK Push initiation and callback mapper.
- M-Pesa reimbursement proof verification: replace the `mpesaService.verifyConfirmation` stub with Daraja transaction lookup or statement reconciliation.

## Identity, Biometrics, And Messaging

- IPRS identity validation: connect the KYC/onboarding and quotation validation gates to the production IPRS service.
- Secure check-in SMS fallback: configure the SMS provider adapter and credentials.
- Secure check-in face match: select and integrate the face-match/liveness vendor.
- WebAuthn relying-party settings: provide environment-specific RP ID, origin, and name for every deployed environment.

## Fulfilment And Network Notifications

- Physical/smart card issuance: connect onboarding card requests to the card production partner queue/API.
- Provider network notifications: connect member onboarding, suspension, termination, and lifecycle events to the provider network notification channel.
- Welcome communications and SLA breach alerts: configure SMTP/Redis/worker operations for email and replace console-only escalation alerts with real notifications.

## Storage And Infrastructure

- MinIO/object storage: define externally reachable object URLs or a signed-download proxy for browser and production use.
- Background workers: ensure Redis, worker process supervision, and recurring job scheduling are provisioned in each non-local environment.
