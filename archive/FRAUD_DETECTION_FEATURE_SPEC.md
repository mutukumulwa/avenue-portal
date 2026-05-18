# AiCare — Real-Time Fraud Detection & Prevention

## Feature Specification v1.0

**Module:** `fraud-detection`
**Priority:** P0 — Core Platform Capability
**Owner:** AiCare Engineering
**Target Client:** Avenue Healthcare (first tenant)
**Status:** Specification — Ready for Antigravity Build

---

## 1. Executive Summary

AiCare operates as a Provider-Sponsored Health Plan (PSHP) where the hospital group (Avenue Healthcare) is simultaneously the payer and the provider. This vertical integration eliminates the traditional adversarial friction between insurer and provider that naturally limits fraud. Without a dedicated detection layer, the system is structurally vulnerable to internal collusion, over-servicing, identity swapping, and billing manipulation.

The Kenyan healthcare market loses approximately KShs 33 billion annually to insurance fraud. Industry surveys indicate that fraudulent claims account for up to 30–50% of paid claims, with over-servicing, generic substitution, and diagnosis manipulation as the most prevalent schemes. The recent SHA transition demonstrated that algorithmic enforcement can block billions in fraudulent claims monthly — but also that hyper-rigid systems can choke legitimate care delivery.

This specification defines a multi-layered, real-time fraud detection engine that integrates directly into AiCare's existing claims, pre-authorization, billing, and enrollment workflows. The system must catch fraud as early as possible — at enrollment, at pre-authorization, and at claim submission — while gracefully degrading to retrospective audit when real-time checks cannot complete, ensuring that patient care is never blocked by detection infrastructure.

### Design Principles

1. **Catch early, catch often.** Every lifecycle stage (enrollment → pre-auth → claim → payment) has its own detection layer. Fraud intercepted at pre-auth costs nothing; fraud caught at payment recovery costs everything.
2. **The provider IS the insurer.** The rules engine must scrutinize internal provider claims with the same rigor as external referral facility claims. No implicit trust for "own hospital" submissions.
3. **Graceful degradation over hard blocks.** If a real-time check fails (network, API timeout, biometric hardware), the encounter proceeds but is flagged for mandatory retrospective audit. Emergency care is never blocked.
4. **Immutable audit trail.** Every fraud flag, every override, every investigation outcome is cryptographically logged. Administrative overrides of fraud flags are themselves auditable events.
5. **Multi-tenant from day one.** Rules, thresholds, ML models, and risk profiles are tenant-scoped. Avenue's configuration is the first instance, not a hardcoded default.
6. **Regulatory language compliance.** Throughout the system, use "membership," "contribution," "package," and "benefit" — never insurance terminology.

---

## 2. Domain Context: Why PSHPs Need Specialized Detection

### 2.1 The Dissolved Payer-Provider Boundary

In a traditional insurer-provider relationship, the insurer is financially motivated to deny questionable claims. In a PSHP like Avenue's membership program, the clinical arm and the underwriting arm share the same balance sheet. If a physician over-services a member (ordering unnecessary MRIs, extending admissions), clinical revenue increases while the membership pool takes a loss. If physician compensation is tied to billing volume rather than care outcomes, the system incentivizes its own staff to defraud its own pool.

**Implication for the rules engine:** The system must maintain an algorithmic "Chinese Wall." Claims from Avenue's own facilities must pass through identical detection pipelines as claims from external referral facilities. The system must dynamically track physician ordering patterns against their compensation structures and lower flagging thresholds when conflicts of interest are detected.

### 2.2 Kenyan-Specific Fraud Vectors

The following fraud typologies are documented as highly prevalent in the Kenyan market and must be addressed with specific detection rules:

| Fraud Type                   | Prevalence (AKI Survey) | Mechanism                                                                        |
| ---------------------------- | ----------------------- | -------------------------------------------------------------------------------- |
| Over-servicing               | 3.3 / 5.0 (highest)     | Unnecessary lab panels, prolonged admissions driven by financial incentive       |
| Generic substitution         | 3.1 / 5.0               | Dispensing cheap generics, billing for branded equivalents                       |
| Pharmacy fraud               | 3.0 / 5.0               | Billing cosmetics, supplements, toiletries as pharmaceuticals                    |
| Non-disclosure of conditions | 2.9 / 5.0               | Concealing chronic illness at enrollment to bypass waiting periods               |
| Diagnosis manipulation       | 2.9 / 5.0               | Altering clinical notes to justify inpatient admission for outpatient conditions |
| Falsified invoices           | 2.9 / 5.0               | Fabricated bills or inflated amounts on legitimate invoices                      |
| Servicing non-members        | 2.7 / 5.0               | Treating uninsured individuals using a member's credentials                      |
| Two-tier pricing             | High (undocumented)     | Charging insured members significantly more than cash-paying patients            |

### 2.3 Adjacent Financial Risks: M-Pesa

With over 86% of Kenyan adults using mobile money, M-Pesa is deeply embedded in healthcare payments. However, the reversal risk for business payments (Paybill and Till numbers) is **low** — Safaricom requires the receiving business to physically authorize any reversal of funds sent to a Paybill or Till, making the "pay, receive service, then auto-reverse" attack impractical. The automated DIY reversal mechanism only applies to person-to-person transfers, not business payment channels.

The **primary M-Pesa fraud vector** in a clinical setting is instead the **fake confirmation SMS**. Fraudsters generate synthetic M-Pesa confirmation messages and present them to hospital billing staff as proof of payment. In some cases, accomplices call staff posing as Safaricom customer care, claiming a system error and requesting a manual "refund." The defense against this is straightforward: the system must validate every payment via the Daraja API before marking it as confirmed, and billing workflows must never accept screenshots or verbal confirmations as proof of payment.

---

## 3. Architecture Overview

### 3.1 Detection Layers

The fraud detection engine operates as three progressive layers, each catching different categories of fraud at different points in the member lifecycle:

```
┌─────────────────────────────────────────────────────────────┐
│                    LAYER 1: GATE CHECKS                      │
│         Identity verification, enrollment validation         │
│              Runs at: Enrollment, Point-of-Care              │
│                   Latency target: < 2s                       │
├─────────────────────────────────────────────────────────────┤
│                 LAYER 2: RULES ENGINE                        │
│     Deterministic heuristics, clinical pathway rules         │
│        Runs at: Pre-Auth submission, Claim submission        │
│                  Latency target: < 500ms                     │
├─────────────────────────────────────────────────────────────┤
│               LAYER 3: ANOMALY DETECTION                     │
│   Statistical profiling, peer comparison, pattern analysis   │
│    Runs at: Post-submission (async), Batch nightly, Ad-hoc   │
│               Latency target: < 30s (async)                  │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Integration Points with Existing AiCare Modules

| AiCare Module                 | Integration Point                             | Detection Layer                |
| ----------------------------- | --------------------------------------------- | ------------------------------ |
| **Enrollment / Endorsements** | Member onboarding, mid-term changes           | Layer 1 (Gate Checks)          |
| **Pre-Authorization**         | Pre-auth request submission                   | Layer 2 (Rules Engine)         |
| **Claims**                    | Claim submission, adjudication                | Layer 2 + Layer 3              |
| **Billing**                   | Payment processing, M-Pesa confirmation       | Layer 1 (Payment verification) |
| **Provider Management**       | Provider profiling, network credentialing     | Layer 3 (Anomaly Detection)    |
| **Broker Portal**             | Enrollment pattern monitoring                 | Layer 3                        |
| **Member Portal**             | Identity verification at login, benefit check | Layer 1                        |

### 3.3 Technology Stack Integration

| Component               | Technology                                            | Role                                            |
| ----------------------- | ----------------------------------------------------- | ----------------------------------------------- |
| Rules Engine runtime    | BullMQ workers on Redis                               | Synchronous rule evaluation with queue fallback |
| Fraud event store       | PostgreSQL (dedicated schema)                         | Immutable flag/investigation/outcome records    |
| Real-time scoring cache | Redis sorted sets                                     | Provider risk scores, member risk scores        |
| Async analysis pipeline | BullMQ dedicated queue                                | Layer 3 anomaly detection jobs                  |
| Audit log               | PostgreSQL with append-only table + trigger-protected | Immutable audit trail                           |
| API layer               | tRPC routers                                          | Fraud dashboard, investigation workflows        |
| External integrations   | HTTP clients (Daraja API, IPRS, SMART/Slade360)       | Identity verification, payment confirmation     |

---

## 4. Data Model Extensions

### 4.1 New Prisma Models

```prisma
// ─── Fraud Detection Core ───────────────────────────────────

model FraudRule {
  id            String   @id @default(cuid())
  tenantId      String
  tenant        Tenant   @relation(fields: [tenantId], references: [id])

  code          String   // e.g. "RULE-TEMP-001", "RULE-UNBUNDLE-003"
  name          String   // Human-readable: "Discharge before admission"
  description   String
  category      FraudRuleCategory
  layer         DetectionLayer
  severity      FraudSeverity

  // Rule definition
  ruleType      RuleType // DETERMINISTIC, STATISTICAL, CLINICAL_PATHWAY
  conditions    Json     // Structured rule conditions (see Rule DSL section)
  actions       Json     // What happens when triggered: FLAG, SUSPEND, REJECT, ALERT

  // Thresholds (tenant-configurable)
  threshold     Float?   // For statistical rules: deviation multiplier
  lookbackDays  Int?     // Temporal window for pattern rules
  cooldownHours Int?     // Minimum gap before re-flagging same entity

  // Lifecycle
  isActive      Boolean  @default(true)
  effectiveFrom DateTime @default(now())
  effectiveTo   DateTime?
  version       Int      @default(1)

  // Relations
  flags         FraudFlag[]

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([tenantId, code])
  @@index([tenantId, isActive, category])
  @@index([tenantId, layer])
}

model FraudFlag {
  id            String   @id @default(cuid())
  tenantId      String
  tenant        Tenant   @relation(fields: [tenantId], references: [id])

  // What was flagged
  entityType    FlagEntityType // CLAIM, PREAUTH, MEMBER, PROVIDER, ENCOUNTER
  entityId      String         // ID of the flagged entity
  ruleId        String
  rule          FraudRule  @relation(fields: [ruleId], references: [id])

  // Flag details
  severity      FraudSeverity
  status        FlagStatus     @default(OPEN)
  score         Float          // 0.0–1.0 confidence score
  reason        String         // Human-readable explanation
  evidence      Json           // Structured evidence payload (data points that triggered)
  metadata      Json?          // Additional context (peer comparisons, historical data)

  // Financial impact
  claimAmount       Decimal?   @db.Decimal(12, 2)
  estimatedLoss     Decimal?   @db.Decimal(12, 2)
  recoveredAmount   Decimal?   @db.Decimal(12, 2)

  // Resolution
  assignedTo        String?    // User ID of investigator
  assignedAt        DateTime?
  resolvedAt        DateTime?
  resolution        FlagResolution?
  resolutionNotes   String?
  resolvedBy        String?    // User ID

  // Escalation
  escalatedAt       DateTime?
  escalatedTo       String?    // Role or user
  escalationReason  String?

  // Relations
  investigation     Investigation?  @relation(fields: [investigationId], references: [id])
  investigationId   String?
  auditEntries      FraudAuditLog[]

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([tenantId, status, severity])
  @@index([tenantId, entityType, entityId])
  @@index([tenantId, ruleId])
  @@index([tenantId, assignedTo, status])
  @@index([createdAt])
}

model Investigation {
  id            String   @id @default(cuid())
  tenantId      String
  tenant        Tenant   @relation(fields: [tenantId], references: [id])

  // Investigation scope
  caseNumber    String   // Auto-generated: "INV-2026-00001"
  title         String
  description   String?
  priority      InvestigationPriority
  status        InvestigationStatus @default(OPEN)
  type          InvestigationType   // SINGLE_FLAG, PATTERN, RING, PROVIDER_AUDIT

  // Subject (who is being investigated)
  subjectType   FlagEntityType
  subjectId     String
  subjectName   String    // Denormalized for dashboard display

  // Financial summary
  totalExposure     Decimal?  @db.Decimal(14, 2) // Sum of flagged claim amounts
  confirmedLoss     Decimal?  @db.Decimal(14, 2)
  recoveredAmount   Decimal?  @db.Decimal(14, 2)

  // Assignment
  leadInvestigator  String?
  assignedTeam      String?

  // Timeline
  openedAt          DateTime  @default(now())
  dueDate           DateTime?
  closedAt          DateTime?
  outcome           InvestigationOutcome?
  outcomeNotes      String?

  // Relations
  flags             FraudFlag[]
  auditEntries      FraudAuditLog[]

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@unique([tenantId, caseNumber])
  @@index([tenantId, status, priority])
  @@index([tenantId, subjectType, subjectId])
}

model FraudAuditLog {
  id            String   @id @default(cuid())
  tenantId      String

  // What happened
  action        AuditAction  // FLAG_CREATED, FLAG_OVERRIDDEN, CLAIM_APPROVED_DESPITE_FLAG,
                             // INVESTIGATION_OPENED, RESOLUTION_APPLIED, RULE_MODIFIED, etc.
  actorId       String       // User who performed the action
  actorRole     String       // Role at time of action (denormalized)

  // Context
  flagId        String?
  flag          FraudFlag?   @relation(fields: [flagId], references: [id])
  investigationId String?
  investigation Investigation? @relation(fields: [investigationId], references: [id])

  // Detail
  description   String
  previousState Json?    // State before the action
  newState      Json?    // State after the action
  justification String?  // Required for overrides

  // Integrity
  checksum      String   // SHA-256 of (action + actorId + timestamp + previousState + newState)

  createdAt     DateTime @default(now())

  // This table is APPEND-ONLY. No updates or deletes.
  // Enforce via database trigger: BEFORE UPDATE OR DELETE ON FraudAuditLog → RAISE EXCEPTION

  @@index([tenantId, flagId])
  @@index([tenantId, investigationId])
  @@index([tenantId, actorId, createdAt])
  @@index([tenantId, action, createdAt])
}

model ProviderRiskProfile {
  id            String   @id @default(cuid())
  tenantId      String
  tenant        Tenant   @relation(fields: [tenantId], references: [id])

  providerId    String
  providerName  String   // Denormalized

  // Composite risk score (0.0 = clean, 1.0 = highest risk)
  riskScore         Float    @default(0.0)
  riskTier          RiskTier @default(LOW)
  lastScoredAt      DateTime?

  // Component scores
  billingAnomalyScore   Float @default(0.0)
  codingPatternScore    Float @default(0.0)
  referralPatternScore  Float @default(0.0)
  claimVelocityScore    Float @default(0.0)
  overrideFrequencyScore Float @default(0.0)

  // Behavioral baselines (computed nightly)
  avgClaimAmount        Decimal?  @db.Decimal(12, 2)
  avgClaimsPerDay       Float?
  avgLengthOfStay       Float?
  topDiagnosisCodes     Json?     // Array of {code, frequency, peerAvg}
  topProcedureCodes     Json?     // Array of {code, frequency, peerAvg}
  peerGroupId           String?   // Which peer group this provider belongs to

  // Flag history
  totalFlags            Int      @default(0)
  confirmedFraudFlags   Int      @default(0)
  falsePositiveFlags    Int      @default(0)

  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@unique([tenantId, providerId])
  @@index([tenantId, riskTier])
  @@index([tenantId, riskScore])
}

model MemberRiskProfile {
  id            String   @id @default(cuid())
  tenantId      String
  tenant        Tenant   @relation(fields: [tenantId], references: [id])

  memberId      String
  memberName    String   // Denormalized

  riskScore     Float    @default(0.0)
  riskTier      RiskTier @default(LOW)
  lastScoredAt  DateTime?

  // Behavioral signals
  claimFrequency        Float?
  benefitUtilizationRate Float?  // % of annual limit consumed
  providerDiversity     Int?     // Number of distinct providers visited
  pharmacyHoppingCount  Int?     // Distinct pharmacies in rolling 30 days
  reversalCount         Int      @default(0) // Payment dispute/reversal count (low risk for Paybill/Till)

  // Identity verification
  identityVerified      Boolean  @default(false)
  biometricAnchored     Boolean  @default(false)
  lastVerifiedAt        DateTime?
  verificationMethod    String?  // IPRS, BIOMETRIC, MANUAL

  totalFlags            Int      @default(0)
  confirmedFraudFlags   Int      @default(0)

  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@unique([tenantId, memberId])
  @@index([tenantId, riskTier])
}

model PaymentReconciliation {
  id                String   @id @default(cuid())
  tenantId          String

  transactionRef    String   // M-Pesa transaction code
  paymentMethod     String   // MPESA_PAYBILL, MPESA_TILL, BANK_TRANSFER, CARD, CASH
  amount            Decimal  @db.Decimal(12, 2)
  direction         PaymentDirection // INBOUND, OUTBOUND
  status            ReconciliationStatus // CONFIRMED, REVERSED, DISPUTED, PENDING

  // M-Pesa specific
  mpesaReceiptNo    String?
  senderPhone       String?  // Masked: 0722***123
  apiVerified       Boolean  @default(false) // Confirmed via Daraja API callback
  apiVerifiedAt     DateTime?
  manualEntry       Boolean  @default(false) // True if entered by staff without API confirmation
  reversalDetected  Boolean  @default(false) // Rare for Paybill/Till, logged for reconciliation
  reversalDetectedAt DateTime?
  reversalAmount    Decimal? @db.Decimal(12, 2)

  // Linked entities
  memberId          String?
  claimId           String?
  invoiceId         String?

  // Reconciliation
  reconciledAt      DateTime?
  reconciledBy      String?  // SYSTEM or user ID
  discrepancyAmount Decimal? @db.Decimal(12, 2)
  discrepancyReason String?

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@unique([tenantId, transactionRef])
  @@index([tenantId, status])
  @@index([tenantId, memberId])
  @@index([tenantId, apiVerified, manualEntry])
}

// ─── Enums ──────────────────────────────────────────────────

enum FraudRuleCategory {
  IDENTITY           // Identity verification, enrollment fraud
  BILLING            // Upcoding, unbundling, phantom billing
  CLINICAL_PATHWAY   // Protocol violations, over-servicing
  TEMPORAL           // Impossible timelines, frequency abuse
  FINANCIAL          // Payment verification, fake confirmation detection
  BEHAVIORAL         // Pattern anomalies, provider profiling
  COLLUSION          // Cross-entity relationship patterns
}

enum DetectionLayer {
  GATE_CHECK    // Layer 1: Enrollment and identity
  RULES_ENGINE  // Layer 2: Deterministic heuristics
  ANOMALY       // Layer 3: Statistical and ML-based
}

enum FraudSeverity {
  LOW        // Informational — log and monitor
  MEDIUM     // Requires review before processing continues
  HIGH       // Suspends processing, requires investigator action
  CRITICAL   // Immediate escalation to fraud team lead
}

enum RuleType {
  DETERMINISTIC       // Hard-coded logic checks
  STATISTICAL         // Threshold-based with peer comparison
  CLINICAL_PATHWAY    // Clinical guideline adherence checks
  COMPOSITE           // Combines multiple sub-rules
}

enum FlagEntityType {
  CLAIM
  PREAUTH
  MEMBER
  PROVIDER
  ENCOUNTER
  PAYMENT
  ENROLLMENT
}

enum FlagStatus {
  OPEN
  UNDER_REVIEW
  ESCALATED
  RESOLVED
  DISMISSED
}

enum FlagResolution {
  CONFIRMED_FRAUD
  FALSE_POSITIVE
  ADMINISTRATIVE_ERROR
  POLICY_EXCEPTION
  REFERRED_TO_EXTERNAL  // e.g., law enforcement, regulatory body
  INCONCLUSIVE
}

enum InvestigationPriority {
  LOW
  MEDIUM
  HIGH
  URGENT
}

enum InvestigationStatus {
  OPEN
  IN_PROGRESS
  PENDING_EVIDENCE
  UNDER_REVIEW
  CLOSED
}

enum InvestigationType {
  SINGLE_FLAG
  PATTERN          // Multiple flags forming a pattern
  RING             // Suspected collusion ring
  PROVIDER_AUDIT   // Scheduled provider review
  MEMBER_AUDIT     // Triggered member review
}

enum InvestigationOutcome {
  FRAUD_CONFIRMED
  NO_FRAUD
  INCONCLUSIVE
  POLICY_VIOLATION     // Not fraud but policy non-compliance
  REFERRED_EXTERNAL
  SETTLEMENT_REACHED
}

enum AuditAction {
  FLAG_CREATED
  FLAG_ASSIGNED
  FLAG_STATUS_CHANGED
  FLAG_OVERRIDDEN         // Admin overrode a fraud flag — HIGH AUDIT PRIORITY
  FLAG_RESOLVED
  INVESTIGATION_OPENED
  INVESTIGATION_ASSIGNED
  INVESTIGATION_CLOSED
  RULE_CREATED
  RULE_MODIFIED
  RULE_DEACTIVATED
  THRESHOLD_CHANGED
  CLAIM_APPROVED_DESPITE_FLAG  // Claim processed despite active flag
  OVERRIDE_ESCALATED           // Override auto-escalated for review
  RISK_SCORE_RECALCULATED
}

enum RiskTier {
  LOW        // Score 0.0–0.3
  MEDIUM     // Score 0.3–0.6
  HIGH       // Score 0.6–0.8
  CRITICAL   // Score 0.8–1.0
}

enum PaymentDirection {
  INBOUND
  OUTBOUND
}

enum ReconciliationStatus {
  CONFIRMED
  REVERSED
  DISPUTED
  PENDING
  FAILED
}
```

---

## 5. Layer 1 — Gate Checks (Identity & Enrollment)

Gate checks run at the earliest possible interception points: member enrollment, point-of-care check-in, and endorsement processing.

### 5.1 Enrollment Verification Rules

| Rule Code      | Name                       | Trigger                  | Check                                                                                                                                               | Action                                                        |
| -------------- | -------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `GATE-ENR-001` | Duplicate member detection | New enrollment submitted | Fuzzy match on name + DOB + phone across all active members in tenant. Levenshtein distance ≤ 2 on name components.                                 | FLAG(MEDIUM) if match found. Block enrollment pending review. |
| `GATE-ENR-002` | Underage principal check   | New enrollment submitted | Validate principal member age ≥ 18 against DOB                                                                                                      | REJECT if underage principal                                  |
| `GATE-ENR-003` | Dependent count anomaly    | New enrollment submitted | Flag if dependents > tenant-configured max (default: 8)                                                                                             | FLAG(LOW), require documentation                              |
| `GATE-ENR-004` | Rapid re-enrollment        | New enrollment submitted | Check if applicant had a membership terminated within the past N days (configurable, default: 90) and exhausted >80% of benefits before termination | FLAG(HIGH) — potential "burn and churn"                       |
| `GATE-ENR-005` | Phone number reuse         | New enrollment submitted | Same phone number already linked to another active member                                                                                           | FLAG(MEDIUM), require verification                            |
| `GATE-ENR-006` | National ID validation     | New enrollment submitted | Validate ID format (8 digits for Kenyan National ID). Future: IPRS API validation.                                                                  | REJECT if invalid format. FLAG if IPRS mismatch.              |

### 5.2 Point-of-Care Identity Verification

| Rule Code      | Name                       | Trigger                     | Check                                                                                                                                          | Action                                           |
| -------------- | -------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `GATE-POC-001` | Membership status check    | Member presents at facility | Verify membership is ACTIVE, not suspended/terminated, and within coverage dates                                                               | REJECT service if inactive                       |
| `GATE-POC-002` | Benefit limit check        | Member presents for service | Check remaining benefit balance against estimated service cost                                                                                 | WARN if <20% remaining. FLAG if limit exhausted. |
| `GATE-POC-003` | Waiting period enforcement | Member requests service     | Verify waiting period has elapsed for the requested benefit category                                                                           | REJECT if within waiting period                  |
| `GATE-POC-004` | Geographic implausibility  | Claim/encounter submitted   | If member has an encounter at Facility A and another encounter at Facility B on the same day, check geographic distance. Flag if >100km apart. | FLAG(HIGH) — possible identity sharing           |
| `GATE-POC-005` | Concurrent encounter check | New encounter opened        | Check if member already has an open (un-discharged) encounter at any facility                                                                  | FLAG(CRITICAL) — potential identity swapping     |

### 5.3 Future: IPRS and Biometric Integration

When IPRS API integration is available, extend Gate Checks with:

- **IPRS identity anchoring:** At enrollment, query IPRS with National ID. Cross-reference returned name, DOB, and gender against submitted application. Mismatch triggers FLAG(HIGH).
- **Photo verification:** Compare IPRS-returned photo against a live capture (webcam or mobile camera) at enrollment. Require liveness detection to prevent photo/video replay attacks.
- **Biometric point-of-care:** Replace physical membership cards with biometric check-in (facial recognition or fingerprint). Eliminates "servicing non-members" fraud entirely.

The system should be designed with integration stubs (service interfaces, data model fields for biometric hashes) so these capabilities can be activated without schema migration when APIs become available.

---

## 6. Layer 2 — Rules Engine (Deterministic Heuristics)

The rules engine evaluates every pre-authorization request and every claim submission synchronously. Rules are organized by category and execute in priority order. If any CRITICAL or HIGH severity rule fires, the claim/pre-auth is suspended pending review.

### 6.1 Temporal & Logical Impossibility Rules

| Rule Code       | Name                        | Condition                                                                                                                                                  | Severity |
| --------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `RULE-TEMP-001` | Discharge before admission  | `dischargeDate < admissionDate`                                                                                                                            | CRITICAL |
| `RULE-TEMP-002` | Future-dated service        | `serviceDate > today()`                                                                                                                                    | CRITICAL |
| `RULE-TEMP-003` | Service during inactivity   | Service date falls within a period where membership was suspended or terminated                                                                            | HIGH     |
| `RULE-TEMP-004` | Duplicate claim             | Same member + same provider + same diagnosis code + same service date + same amount (within ±5%)                                                           | HIGH     |
| `RULE-TEMP-005` | Rapid re-submission         | Same claim resubmitted within 24 hours of a rejection, with only the amount changed                                                                        | MEDIUM   |
| `RULE-TEMP-006` | Impossible procedure repeat | Procedure that can only occur once (appendectomy, tonsillectomy, hysterectomy) submitted for a member who already has an approved claim for that procedure | CRITICAL |

### 6.2 Billing Integrity Rules

| Rule Code       | Name                    | Condition                                                                                                                                                                                  | Severity |
| --------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `RULE-BILL-001` | Upcoding detection      | Claim uses ICD-10 codes at a complexity level ≥2 standard deviations above the provider's peer group average for the same diagnosis family                                                 | HIGH     |
| `RULE-BILL-002` | Unbundling detection    | Multiple granular procedure codes submitted on the same date for the same member that logically constitute a single bundled procedure (maintained via a `ProcedureBundle` reference table) | HIGH     |
| `RULE-BILL-003` | Amount exceeds tariff   | Claimed amount exceeds the tenant's negotiated tariff for the procedure code by >15%                                                                                                       | MEDIUM   |
| `RULE-BILL-004` | Round-number clustering | Claim amount is a round number (e.g., exactly KShs 50,000 or KShs 100,000). Multiple round-number claims from the same provider in the same month exceeds threshold.                       | LOW      |
| `RULE-BILL-005` | Zero-cost claim         | Claim submitted with amount = 0 but includes billable procedure codes                                                                                                                      | MEDIUM   |
| `RULE-BILL-006` | Excessive line items    | Single claim contains >N line items (configurable, default: 25)                                                                                                                            | LOW      |
| `RULE-BILL-007` | Weekend/holiday surge   | Claims volume from a specific provider on weekends/public holidays exceeds 150% of their weekday average                                                                                   | MEDIUM   |

### 6.3 Clinical Pathway Rules

These rules codify medical protocols to detect over-servicing, protocol violations, and medically implausible claims. The rules reference a `ClinicalGuideline` table that can be populated per-tenant with guidelines from the Kenya Ministry of Health or facility-specific protocols.

| Rule Code       | Name                               | Condition                                                                                                                                                                                                   | Severity |
| --------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `RULE-CLIN-001` | Gender-procedure mismatch          | Procedure or diagnosis code is gender-specific and does not match member's recorded gender. E.g., prostate exam (ICD Z12.5) for female member; obstetric codes (O00-O9A) for male member.                   | CRITICAL |
| `RULE-CLIN-002` | Age-procedure mismatch             | Procedure is age-inappropriate. E.g., pediatric vaccination codes for adult member; geriatric screening for member <40.                                                                                     | HIGH     |
| `RULE-CLIN-003` | Medication without diagnosis       | Pharmacy claim for a specific medication class submitted without a corresponding diagnosis code in the encounter. E.g., anti-malarial dispensed without malaria RDT or blood smear on record.               | HIGH     |
| `RULE-CLIN-004` | Diagnostic frequency excess        | Same diagnostic test (lab panel, imaging study) performed on the same member more than N times within M days, without a critical-care or chronic-management justification code. Configurable per test type. | MEDIUM   |
| `RULE-CLIN-005` | Length-of-stay outlier             | Inpatient admission length exceeds 2× the expected LOS for the primary diagnosis code (referencing a `DiagnosisLOS` lookup table)                                                                           | MEDIUM   |
| `RULE-CLIN-006` | Outpatient-to-inpatient conversion | An encounter that started as outpatient is converted to inpatient within the same day, and the inpatient diagnosis is identical to the outpatient diagnosis. Common upcoding pattern.                       | HIGH     |
| `RULE-CLIN-007` | Pharmacy substitution signal       | Pharmacy claim bills a branded drug, but the facility's procurement records (if integrated) show only generic equivalents in stock for that period.                                                         | HIGH     |

### 6.4 Cross-Entity Relationship Rules

| Rule Code      | Name                     | Condition                                                                                                                                                                                                        | Severity |
| -------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `RULE-REL-001` | Referral concentration   | >60% of a single physician's referrals in a rolling 90-day window go to the same external diagnostic facility or pharmacy                                                                                        | HIGH     |
| `RULE-REL-002` | Provider-member affinity | A specific provider serves the same member >N times per month (configurable) at a rate exceeding 3× the provider's average member visit frequency                                                                | MEDIUM   |
| `RULE-REL-003` | Broker enrollment spike  | A broker submits >N enrollments in a single day (configurable, default: 20), or >50% of a broker's enrolled members make claims within the first 30 days of membership (possible adverse selection or collusion) | HIGH     |

### 6.5 Financial & Payment Rules

| Rule Code      | Name                        | Condition                                                                                                                                                           | Severity |
| -------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `RULE-FIN-001` | Unverified payment accepted | A payment is marked as received in the billing system without a corresponding Daraja API confirmation callback. Indicates possible acceptance of a fake M-Pesa SMS. | HIGH     |
| `RULE-FIN-002` | Contribution arrears        | Member has >N months of unpaid contributions but continues to access services (grace period exceeded)                                                               | HIGH     |
| `RULE-FIN-003` | Copayment waiver pattern    | Provider consistently waives or reduces copayments for members. >70% copayment waiver rate across members.                                                          | MEDIUM   |
| `RULE-FIN-004` | Split billing               | A single treatment episode is billed across multiple separate claims on consecutive days, each below the auto-approval threshold, where the sum would exceed it.    | HIGH     |

### 6.6 Rules Engine Configuration

Rules must be tenant-configurable without code deployment. The `FraudRule.conditions` JSON field uses a structured DSL:

```json
{
  "operator": "AND",
  "conditions": [
    {
      "field": "claim.serviceDate",
      "comparator": "LESS_THAN",
      "value": { "ref": "claim.admissionDate" }
    },
    {
      "field": "claim.claimType",
      "comparator": "EQUALS",
      "value": "INPATIENT"
    }
  ]
}
```

Supported comparators: `EQUALS`, `NOT_EQUALS`, `GREATER_THAN`, `LESS_THAN`, `BETWEEN`, `IN`, `NOT_IN`, `CONTAINS`, `REGEX`, `IS_NULL`, `IS_NOT_NULL`, `DEVIATION_ABOVE` (for statistical rules, references a peer-group baseline), `FREQUENCY_EXCEEDS` (for temporal pattern rules).

The `FraudRule.actions` JSON defines what happens when a rule fires:

```json
{
  "primary": "SUSPEND",
  "notifications": [
    { "channel": "IN_APP", "roles": ["CLAIMS_OFFICER", "FRAUD_ANALYST"] },
    { "channel": "EMAIL", "roles": ["FRAUD_TEAM_LEAD"] }
  ],
  "autoEscalate": {
    "afterHours": 24,
    "to": "FRAUD_TEAM_LEAD"
  }
}
```

---

## 7. Layer 3 — Anomaly Detection (Statistical & Pattern Analysis)

Layer 3 runs asynchronously via BullMQ workers. It processes claims in near-real-time (within 30 seconds of submission) and runs comprehensive batch analysis nightly.

### 7.1 Provider Profiling & Peer Comparison

**Objective:** Establish behavioral baselines for each provider and flag deviations.

**Peer Group Assignment:** Providers are grouped by specialty, facility tier, and geographic region. Each provider's metrics are compared against their peer group, not global averages.

**Metrics computed nightly:**

| Metric                        | Computation                                                            | Flag Threshold                              |
| ----------------------------- | ---------------------------------------------------------------------- | ------------------------------------------- |
| Average claim amount          | Mean of all claims in rolling 90 days                                  | >2σ above peer mean                         |
| Claims velocity               | Claims per day, rolling 30 days                                        | >2.5σ above peer mean                       |
| Diagnosis code concentration  | HHI (Herfindahl-Hirschman Index) of diagnosis codes used               | HHI >0.25 (over-reliance on specific codes) |
| Procedure code diversity      | Count of distinct procedure codes / total claims                       | <0.1 (suspiciously narrow procedure range)  |
| Inpatient-to-outpatient ratio | Inpatient claims / total claims                                        | >2σ deviation from peer ratio               |
| Average length of stay        | Mean LOS for inpatient admissions by diagnosis                         | >1.5σ above peer mean                       |
| Rejection-resubmission rate   | % of rejected claims that are resubmitted                              | >50% (gaming detection thresholds)          |
| Override request rate         | % of this provider's flagged claims where admin override was requested | >30% (possible internal pressure)           |

**Risk Score Calculation:**

```
providerRiskScore = Σ(metric_deviation_i × weight_i) / Σ(weight_i)
```

Weights are tenant-configurable. Default weights prioritize billing anomaly (0.25), coding patterns (0.20), claims velocity (0.20), referral concentration (0.15), override frequency (0.10), and historical confirmed fraud (0.10).

Risk tiers are assigned based on the composite score: LOW (0–0.3), MEDIUM (0.3–0.6), HIGH (0.6–0.8), CRITICAL (0.8–1.0).

### 7.2 Member Profiling

| Metric              | Computation                                             | Flag Threshold                                          |
| ------------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| Benefit burn rate   | % of annual limit consumed / % of coverage year elapsed | Ratio >2.0 (consuming benefits at 2× the expected rate) |
| Provider hopping    | Distinct providers visited in 30 days                   | >5 for the same diagnosis family                        |
| Pharmacy hopping    | Distinct pharmacies used in 30 days                     | >3 (possible prescription diversion)                    |
| Claim frequency     | Claims per month                                        | >3σ above package-cohort average                        |
| Early-claim pattern | Claims within first 30 days of enrollment               | Multiple high-value claims in first month               |

### 7.3 Pattern Detection (Batch Analysis)

These analyses run nightly and generate investigation leads:

**Duplicate Claim Network Detection:**
Identify clusters of claims that share >3 of: same diagnosis, same procedure, same amount (±5%), same provider, same date range (±3 days), different members. Could indicate a billing template being applied to multiple members.

**Temporal Burst Analysis:**
Detect providers or facilities that show sudden, significant increases in claims volume (>200% of trailing 90-day average) sustained over >5 days. Could indicate a phantom billing campaign.

**Two-Tier Pricing Detection:**
For providers that serve both members and cash-paying patients (if cash pricing data is available through HMS integration), compare average charges per procedure code. Flag providers where member pricing exceeds cash pricing by >30%.

**Collusion Ring Detection:**
Graph analysis of member-provider-pharmacy relationships. Identify tight clusters where a small group of members consistently visits the same provider and fills prescriptions at the same pharmacy, with unusually high claim values. Use community detection algorithms on the relationship graph.

### 7.4 Implementation Notes for Layer 3

- All Layer 3 computations run on **BullMQ workers** in a dedicated `fraud-analysis` queue, separate from the main claims processing queue.
- Provider and member risk profiles are cached in **Redis sorted sets** keyed by `tenantId:provider-risk` and `tenantId:member-risk`, enabling O(log N) lookups during Layer 2 rule evaluation (e.g., "apply stricter thresholds for HIGH-risk providers").
- Nightly batch jobs use **PostgreSQL window functions and CTEs** for peer comparison computations — not application-level loops.
- The system does NOT require a separate ML model deployment initially. The statistical profiling (standard deviation, HHI, z-scores) provides strong anomaly detection without the overhead of model training infrastructure. ML model integration (Isolation Forest, Random Forest classifiers) is a Phase 2 enhancement once sufficient labeled data (confirmed fraud vs. false positive outcomes) has been accumulated through the investigation workflow.

---

## 8. Alert, Investigation & Resolution Workflow

### 8.1 Alert Routing

When a fraud flag is created, the system routes it based on severity:

| Severity | Routing                                                               | SLA                    |
| -------- | --------------------------------------------------------------------- | ---------------------- |
| LOW      | Logged. Visible on dashboard. No notification.                        | Review within 7 days   |
| MEDIUM   | In-app notification to assigned Claims Officer.                       | Review within 48 hours |
| HIGH     | In-app + email to Fraud Analyst. Claim/pre-auth processing suspended. | Review within 24 hours |
| CRITICAL | In-app + email + SMS to Fraud Team Lead. Processing blocked.          | Review within 4 hours  |

Auto-escalation: If a flag is not actioned within its SLA window, it automatically escalates one severity level.

### 8.2 Investigation Lifecycle

```
Flag Created → [Auto-assign or manual assign] → Under Review
    ↓
Investigator reviews evidence, requests additional data
    ↓
Resolution: CONFIRMED_FRAUD | FALSE_POSITIVE | ADMINISTRATIVE_ERROR | POLICY_EXCEPTION
    ↓
If CONFIRMED_FRAUD:
    → Link to Investigation case (or create new)
    → Apply recovery action (benefit clawback, provider suspension, member termination)
    → Update risk profiles
    → Feed back to rules engine (adjust thresholds)
    ↓
If FALSE_POSITIVE:
    → Update risk profiles (reduce score)
    → Feed back to rules engine (consider loosening threshold if false positive rate >30%)
```

### 8.3 Override Protocol

When an authorized user overrides a fraud flag (approves a claim despite an active flag), the system MUST:

1. Record the override in `FraudAuditLog` with action `FLAG_OVERRIDDEN`
2. Require a mandatory `justification` text field (minimum 20 characters)
3. Record the overrider's role and credentials
4. If the overrider and the flagged provider are in the same department, auto-escalate to `OVERRIDE_ESCALATED` and notify the Fraud Team Lead
5. Generate a monthly "Override Report" aggregating all overrides by user, department, and outcome

### 8.4 Dashboard & Reporting

The fraud detection module exposes a dashboard via tRPC endpoints:

**Real-time dashboard views:**

- Open flags by severity (with drill-down to individual flags)
- Active investigations by status and priority
- Provider risk heatmap (top 20 highest-risk providers)
- Member risk leaderboard (top 20 highest-risk members)
- Today's detection activity (flags created, resolved, overridden)
- Unverified payment alerts

**Periodic reports (auto-generated):**

- Weekly: Flag summary, false positive rate, average resolution time
- Monthly: Provider risk score trends, override report, financial exposure summary
- Quarterly: Fraud confirmed vs. recovered analysis, rules effectiveness review (which rules catch the most confirmed fraud)

---

## 9. M-Pesa Integration for Payment Fraud Prevention

### 9.1 Daraja API Integration

The primary purpose of Daraja API integration is **payment confirmation** — ensuring that every M-Pesa payment recorded in the system corresponds to a real, verified transaction. Reversal fraud is a low-risk vector for Paybill/Till payments since Safaricom requires the receiving business to physically authorize reversals on these channels.

**Inbound payment confirmation (C2B):**

- Register C2B (Customer to Business) callback URLs with Safaricom
- On receiving a payment confirmation callback, immediately match to pending invoices/contributions
- Update `PaymentReconciliation` with CONFIRMED status
- The billing UI must display a clear **"API Verified"** badge only after the Daraja callback confirms the transaction — never based on manual entry or screenshots

**Outbound payment verification (B2C):**

- Before processing any B2C (Business to Customer) refund or payment, verify the recipient is a known entity (member, provider, staff)
- Flag any B2C payment to a phone number not registered in the system

**Reversal monitoring (low priority):**

- While automated reversals on Paybill/Till are unlikely, the system should still log any reversal notifications received via the Daraja API for reconciliation purposes
- Reversal events are logged in `PaymentReconciliation` with status REVERSED and flagged at LOW severity for monthly review — no real-time emergency escalation needed

### 9.2 Fake Payment Detection

The highest-value payment fraud protection is preventing acceptance of fabricated M-Pesa confirmation messages:

- **Mandatory API verification:** The billing module must NOT allow a payment to be marked as confirmed based on manual entry alone. Every M-Pesa payment must be cross-referenced against the Daraja API before it clears.
- **Unverified payment flag:** If a billing staff member records a payment manually and no matching Daraja callback arrives within 10 minutes, RULE-FIN-001 fires automatically, flagging the payment as potentially fake.
- **Staff workflow enforcement:** The billing UI should make it physically impossible to proceed with service delivery against an unverified M-Pesa payment. The "Payment Confirmed" status should only be settable by the system (via API callback), never by a user clicking a button.

---

## 10. API Surface (tRPC Routers)

### 10.1 Router: `fraud`

```typescript
// ── Flags ──────────────────────────────────────────────────
fraud.getFlags; // List flags with filters (status, severity, entity, date range)
fraud.getFlagById; // Single flag with full evidence and audit trail
fraud.assignFlag; // Assign a flag to an investigator
fraud.resolveFlag; // Resolve a flag with outcome and notes
fraud.overrideFlag; // Override a flag (requires justification, triggers audit)
fraud.escalateFlag; // Manually escalate a flag

// ── Investigations ─────────────────────────────────────────
fraud.getInvestigations; // List investigations with filters
fraud.getInvestigationById;
fraud.createInvestigation; // Create from one or more flags
fraud.updateInvestigation; // Update status, assignment, notes
fraud.closeInvestigation; // Close with outcome

// ── Rules ──────────────────────────────────────────────────
fraud.getRules; // List all rules for tenant
fraud.getRuleById;
fraud.createRule; // Create a new rule (admin only)
fraud.updateRule; // Modify rule (creates new version, audit logged)
fraud.toggleRule; // Activate/deactivate a rule
fraud.testRule; // Dry-run a rule against historical claims data

// ── Risk Profiles ──────────────────────────────────────────
fraud.getProviderRiskProfile;
fraud.getProviderRiskProfiles; // List with sorting/filtering
fraud.getMemberRiskProfile;
fraud.getMemberRiskProfiles;
fraud.recalculateProviderRisk; // Trigger on-demand recalculation
fraud.recalculateMemberRisk;

// ── Dashboard ──────────────────────────────────────────────
fraud.getDashboardSummary; // Aggregated stats for dashboard
fraud.getFlagTrends; // Time-series flag data
fraud.getRuleEffectiveness; // Which rules produce most confirmed fraud
fraud.getOverrideReport; // Override activity summary
fraud.getFinancialExposure; // Total exposure by status

// ── Audit ──────────────────────────────────────────────────
fraud.getAuditLog; // Query audit entries with filters
fraud.getAuditTrailForFlag; // Full audit trail for a specific flag
fraud.getAuditTrailForInvestigation;

// ── Payments ───────────────────────────────────────────────
fraud.getPaymentReconciliation; // List reconciliation entries
fraud.getUnverifiedPaymentAlerts; // Payments without Daraja API confirmation
```

### 10.2 RBAC Requirements

| Role            | Permissions                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| Claims Officer  | View flags assigned to them, resolve LOW/MEDIUM flags, view own audit trail                            |
| Fraud Analyst   | View all flags, resolve all flags, create investigations, view all audit trails                        |
| Fraud Team Lead | All Analyst permissions + override flags + close investigations + modify rules + view override reports |
| System Admin    | All Lead permissions + create/deactivate rules + manage role assignments + export audit logs           |

---

## 11. Build Phases

### Phase 1: Foundation (Week 1–2)

- Prisma schema additions (all models and enums from Section 4)
- Database migration and seed data for default rules
- `FraudAuditLog` append-only trigger
- tRPC router stubs
- BullMQ queue setup for `fraud-analysis`

### Phase 2: Layer 2 — Rules Engine (Week 2–4)

- Rules engine core: DSL parser, condition evaluator, action executor
- Implement all RULE-TEMP-\* temporal rules
- Implement all RULE-BILL-\* billing rules
- Implement RULE-CLIN-001 through RULE-CLIN-004 clinical pathway rules
- Integration hooks: inject rules engine into pre-auth submission flow and claims submission flow
- Flag creation and basic alert routing

### Phase 3: Layer 1 — Gate Checks (Week 3–4)

- Implement GATE-ENR-\* enrollment verification rules
- Implement GATE-POC-\* point-of-care checks
- Integration hooks: inject gate checks into enrollment flow and encounter creation flow
- IPRS integration stubs (interface + mock for development)

### Phase 4: Investigation Workflow (Week 4–5)

- Flag management UI (list, detail, assign, resolve, override)
- Investigation lifecycle UI
- Override protocol with mandatory justification and audit logging
- Alert routing and auto-escalation via BullMQ delayed jobs

### Phase 5: Layer 3 — Anomaly Detection (Week 5–7)

- Provider risk profiling (nightly batch job)
- Member risk profiling (nightly batch job)
- Peer group assignment logic
- Risk score caching in Redis
- Risk-adaptive thresholds in Layer 2 (stricter checks for high-risk entities)
- Fraud dashboard with real-time views

### Phase 6: Payment Integration (Week 7–8)

- Daraja API integration for C2B payment confirmation
- PaymentReconciliation workflow
- RULE-FIN-\* financial rules implementation (focus on unverified payment detection)
- Billing UI enforcement: API-verified payments only

### Phase 7: Reporting & Refinement (Week 8–9)

- Automated report generation (weekly, monthly, quarterly)
- Rule effectiveness analytics
- False positive rate tracking and threshold tuning UI
- Pattern detection batch jobs (duplicate networks, temporal bursts)
- Export capabilities for audit logs

---

## 12. Seed Data Requirements

### 12.1 Default Rules

The system must ship with all rules defined in Sections 5, 6, and 7 pre-seeded for each tenant. Rules should be seeded as `isActive: true` with sensible default thresholds that can be tuned per-tenant.

### 12.2 Reference Data

| Table                        | Source                                            | Purpose                                     |
| ---------------------------- | ------------------------------------------------- | ------------------------------------------- |
| `ProcedureBundle`            | Standard surgical package definitions             | Unbundling detection (RULE-BILL-002)        |
| `DiagnosisLOS`               | Expected length of stay by primary diagnosis      | LOS outlier detection (RULE-CLIN-005)       |
| `ClinicalGuideline`          | Kenya MoH guidelines + facility protocols         | Clinical pathway validation                 |
| `GenderSpecificCodes`        | ICD-10 gender-specific code ranges                | Gender-procedure mismatch (RULE-CLIN-001)   |
| `SingleOccurrenceProcedures` | Procedures that can only happen once per lifetime | Impossible repeat detection (RULE-TEMP-006) |
| `TariffSchedule`             | Negotiated provider tariffs per procedure code    | Amount validation (RULE-BILL-003)           |

### 12.3 Test Scenarios

Seed the development environment with synthetic claims data that includes known fraud patterns for each rule category. This enables Antigravity to verify each rule fires correctly during development. Include:

- A provider with statistically anomalous billing patterns (high claims velocity, narrow procedure range)
- A member with rapid benefit exhaustion and pharmacy hopping
- Claims with temporal impossibilities (discharge before admission, future dates)
- A set of unbundled surgical claims
- A set of gender-mismatched diagnosis codes
- An unverified M-Pesa payment scenario (manual entry with no Daraja callback)

---

## 13. Non-Functional Requirements

| Requirement                | Target               | Notes                                                        |
| -------------------------- | -------------------- | ------------------------------------------------------------ |
| Layer 2 evaluation latency | <500ms p95           | Rules engine must not perceptibly slow claim submission      |
| Layer 1 gate check latency | <2s p95              | Includes any external API calls (IPRS when available)        |
| Layer 3 async scoring      | <30s per claim       | Near-real-time anomaly scoring via BullMQ                    |
| Nightly batch completion   | <2 hours             | Full provider and member risk recalculation                  |
| Audit log immutability     | Enforced at DB level | PostgreSQL trigger prevents UPDATE/DELETE on `FraudAuditLog` |
| Flag data retention        | 7 years minimum      | Regulatory and audit compliance                              |
| Concurrent investigators   | 10+ per tenant       | Dashboard and flag management must handle concurrent access  |

---

## 14. Dependencies & Assumptions

### Dependencies

- Existing AiCare claims module with structured claim data (ICD-10 codes, procedure codes, amounts, dates)
- Existing AiCare pre-authorization module with submission workflow
- Existing AiCare enrollment module with member demographics
- BullMQ and Redis infrastructure (already in tech stack)
- PostgreSQL (already in tech stack via Supabase)

### Assumptions

- ICD-10 coding is used for diagnoses (standard in Kenyan private healthcare)
- Provider tariff schedules are maintained in the system
- Encounter data includes admission/discharge timestamps
- The system has a user/role management module for RBAC

### Out of Scope (Phase 1)

- ML model training and deployment (Isolation Forest, Random Forest) — deferred until sufficient labeled investigation data is accumulated
- Real-time biometric verification hardware integration — deferred until IPRS API access is secured
- Integration with external fraud databases or industry-wide shared data systems
- Automated recovery actions (clawback, provider suspension) — flagged for manual action in Phase 1

---

_This specification should be placed at the root of the AiCare repository as `FRAUD_DETECTION_FEATURE_SPEC.md` and referenced by AGENTS.md as a build input for the fraud-detection module._
