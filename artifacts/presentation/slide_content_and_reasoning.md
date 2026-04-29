# Avenue Hospital Membership Program Strategy

Text-only companion to `Avenue_Hospital_Membership_Program_Strategy.pptx`

## Slide 1: Hospital membership, run like a health plan

Visible content:
- AiCare | Avenue Healthcare
- Hospital membership, run like a health plan
- How Avenue can operate a provider-sponsored membership program with insurance-grade control, member-grade trust, and hospital-grade care flow.
- Member -> Care -> Fund -> Audit

Reasoning:
This opens with the core positioning. The system is not presented as a generic hospital portal or a generic insurance platform. It is framed as a provider-sponsored membership operating model where access to care, financial stewardship, and auditability are linked.

## Slide 2: The point is not to imitate an insurer

Visible content:
- Avenue is both the care provider and the membership pool steward.
- Traditional competitor pattern: separate insurer, hospital, broker, TPA, and member tools stitched together after the fact.
- AiCare operating pattern: one membership platform covering enrollment, packages, check-in, pre-auth, claims, finance, fraud, service, and stakeholder portals.

Reasoning:
This slide explains the strategic difference. A hospital-owned membership program has a different control problem from traditional insurance because the provider and fund steward are connected. The system’s advantage is that it manages the whole loop rather than reconciling disconnected systems later.

## Slide 3: One closed loop from sale to care to settlement

Visible content:
- Quote
- Enroll
- Configure
- Verify
- Authorize
- Adjudicate
- Settle
- Learn

Reasoning:
This slide gives the audience a simple mental model of the platform. It shows that the system manages the full lifecycle, from commercial entry to operational learning, rather than only one department’s workflow.

## Slide 4: The system gives every actor the correct workbench

Visible content:
- Admin: membership, claims, packages, billing, providers, reports, fraud, settings
- HR manager: roster, endorsement requests, invoices, utilization, service requests
- Member: digital card, benefits, dependents, utilization, pre-auth, facilities, security
- Broker: groups, submissions, quotations, commissions, renewals, support
- Fund admin: deposits, balances, claim deductions, category holds, statements

Reasoning:
This slide makes the system feel comprehensive without listing every screen. It shows that AiCare is role-aware and operationally useful to each stakeholder, which is important for adoption by hospitals, employers, members, brokers, and fund administrators.

## Slide 5: Membership products are configurable, not hard-coded

Visible content:
- Configurable building blocks
- Packages, package versions, benefit categories, sub-limits, waiting periods, group benefit tiers, and contribution rates support both corporate and individual programs.
- Example benefit categories: outpatient, inpatient, dental
- Example controls: annual sub-limit, waiting period, co-contribution

Reasoning:
This slide explains how the platform supports insurance-like products while preserving membership language. Configurability is a competitive differentiator because Avenue can tailor offerings without rebuilding the system.

## Slide 6: Enrollment and endorsements become controlled membership changes

Visible content:
- What it manages: member profiles, dependents and relationships, group rosters and imports, endorsement requests, status changes and renewals
- HR request: add dependent, remove member, transfer group, update profile
- Admin review: validate eligibility, effective date, package version, billing impact
- Result: roster, invoice, and benefit state updated

Reasoning:
Enrollment is often where data errors and billing disputes begin. This slide shows that member changes are not informal admin edits; they are controlled events with downstream billing and benefit impact.

## Slide 7: Point-of-care verification is a first-class control

Visible content:
- The check-in is not a plastic card moment. It is an auditable visit opening.
- Primary path uses WebAuthn/passkey-style device verification plus a reception code match.
- Fallbacks preserve access without hiding risk.
- Flow: reception starts check-in, device biometric signs challenge, member and reception compare code, visit opens and enters audit chain, emergency override allowed then reviewed.

Reasoning:
This is one of the strongest differentiators. A provider-sponsored membership program must prevent non-members from consuming benefits using someone else’s credentials. The slide also shows the system balances fraud prevention with clinical access.

## Slide 8: Pre-auth and claims share the same clinical-financial spine

Visible content:
- Claim adjudication workbench
- Structured service lines by category
- ICD-10 and CPT support
- Tariff variance detection
- Documents and exception workflow
- Co-contribution collection
- Why it matters: the claim connects to package, facility check-in, provider contract, HR roster, fund balance, GL posting, and fraud history.

Reasoning:
This slide shows that claims are not handled as isolated reimbursement records. The system can evaluate claims using membership, clinical, provider, finance, and fraud context.

## Slide 9: Fraud control is embedded before, during, and after care

Visible content:
- Gate checks: identity, enrollment validation, payment verification
- Rules engine: pre-auth and claim heuristics, tariff and pathway checks
- Anomaly detection: provider, member, broker, and check-in pattern review
- Immutable audit: overrides, flags, investigations, and outcomes retained
- Key difference: the system does not assume Avenue facilities are automatically low-risk.

Reasoning:
This slide addresses the special risk of a hospital that is also operating a membership pool. Internal over-servicing, identity substitution, and override abuse require embedded controls rather than after-the-fact review.

## Slide 10: Finance is connected to the membership event stream

Visible content:
- Insurance-like discipline without insurance-language drift
- The product uses membership terms: member, contribution, package, benefit.
- Under the hood it supports billing runs, invoices, payments, ledgers, reports, and accounting controls.
- Finance loop: contribution rate -> invoice -> payment -> claim approval -> GL posting -> report/export

Reasoning:
This slide connects regulatory/commercial positioning to operational finance. The platform avoids insurance terminology where needed, while still supporting the controls expected from a payer-like operation.

## Slide 11: Self-funded schemes are not spreadsheets bolted on the side

Visible content:
- Fund control surface
- Deposits and top-ups
- Minimum balance alerts
- Claim deductions
- Admin fee invoicing
- Category holds
- Exportable statements
- The hospital becomes a transparent administrator of the client’s money.

Reasoning:
This slide highlights a major enterprise sales advantage. Employers running self-funded arrangements need live fund visibility and controls, not static statements or manual reconciliation.

## Slide 12: The member experience is more than eligibility lookup

Visible content:
- Digital member card
- Benefits, dependents, utilization, pre-auth, facilities, support, and device security in one portal
- Why it changes operations: fewer calls to HR and customer service, members understand remaining benefits, pre-auth and utilization are visible, security actions are member-controlled, support has membership context

Reasoning:
This slide shifts from back-office control to member trust. The system differentiates itself by making the membership program visible and useful to the member, not just to administrators.

## Slide 13: The platform is built as a tenant-ready operating system

Visible content:
- Multi-tenant SaaS: tenant-scoped data and white-label theming
- Role-based access: admin, clinical, finance, HR, broker, member, fund roles
- API layer: tRPC and REST-style endpoints for eligibility, claims, benefits, pre-auth
- Background jobs: billing runs, renewals, reports, escalations, balance alerts
- Document storage: claims, contracts, invoices, and correspondence
- PWA/security: member check-in and WebAuthn device registration

Reasoning:
This slide gives technical credibility without going too deep. It shows that the platform is not merely a collection of pages, but an extensible operating system for membership administration.

## Slide 14: What sets it apart from competitors

Visible content:
- Competitor norm: separate insurer/TPA/provider tools
- AiCare difference: one hospital-owned membership operating layer
- Competitor norm: card or OTP eligibility checks
- AiCare difference: passkey-style check-in plus fallback audit
- Competitor norm: claims review after service
- AiCare difference: checks at enrollment, pre-auth, visit, claim, and payment
- Competitor norm: self-funded via statements
- AiCare difference: live fund ledger, holds, low-balance alerts
- Competitor norm: portals as status viewers
- AiCare difference: portals that let actors perform their actual work

Reasoning:
This slide directly answers the competitive positioning part of the request. It contrasts the platform against likely alternatives in a way that is easy for a buyer or executive to remember.

## Slide 15: Value for the hospital, employers, members, and brokers

Visible content:
- Hospital: better loss control, utilization insight, faster settlement, auditable overrides
- Employer: roster control, invoice clarity, utilization reporting, self-funded transparency
- Member: visible benefits, digital card, check-in security, support and facilities access
- Broker: quotations, submissions, commissions, renewals, group visibility

Reasoning:
This slide translates features into stakeholder value. It helps the audience understand why each participant would accept or prefer the system.

## Slide 16: A practical adoption path

Visible content:
- Phase 1: stabilize core: packages, groups, members, billing, claims, reports
- Phase 2: activate controls: secure check-in, tariff variance, fraud desk, audit review
- Phase 3: open portals: HR, member, broker, and fund self-service workflows
- Phase 4: optimize pool: utilization, renewals, pricing feedback, service trends

Reasoning:
This slide prevents the deck from feeling like a theoretical product tour. It shows how the system can be rolled out in a practical sequence that reduces risk and builds value over time.

## Slide 17: The story to take forward

Visible content:
- Avenue can offer members a program that feels simple at the front door and behaves rigorously behind the scenes.
- The competitive position: integrated care access, transparent membership finance, and fraud-aware operations in one system.
- Next: manual + screenshots

Reasoning:
This closing slide restates the main strategic message. It also creates a natural bridge to the next requested artifact: the full user manual with screenshots.
