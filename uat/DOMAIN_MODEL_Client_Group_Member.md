# Domain model — Tenant → Client → Group → Member (why "Client" exists)

This answers the question raised during the fix pass: *what is the difference
between Client, Group and Member, and does "Client" duplicate something?*

Verified against `prisma/schema.prisma` (Client @ line 141, Group @ 717,
Member @ 885) and `clientResolve.ts`.

## The four tiers

| Tier | Model | "What it is" | Belongs to |
|---|---|---|---|
| Operator | `Tenant` | The Medvex TPA instance itself (multi-tenant root). | — |
| **Payer** | `Client` | The party whose money is at risk and whose rules govern — an insurer/underwriter, a self-funded corporate, or an individual policyholder that Medvex administers **on behalf of**. | one Tenant (`operatorTenantId`); may have a parent Client (hierarchy) |
| **Scheme** | `Group` | A policy/product under a payer — a corporate employer scheme (e.g. "Safaricom PLC") or an individual/family policy. | exactly one `Client` (`clientId` required) |
| **Life** | `Member` | An individual insured person within a scheme; principal or dependent. | exactly one `Group` (`groupId` required); dependents link via `principalId` |

Chain: **Tenant → Client → Group → Member**. A Member reaches its Client only
*through* its Group — there is deliberately **no** `Member.clientId`.

## Why Client is a distinct tier (not duplication of Group)

`Client` owns everything that is **per-payer** and must apply across *all* that
payer's schemes:

- **Member numbering** (`memberNumberPrefix`, default "MVX") and **branding**
  (`logoUrl`, `primaryColor`, …) — a payer's cards/letters look the same across
  every scheme it owns.
- **Base currency** (`currency`) — the payer's ledger currency (schemes and
  claims layer their own on top; this is what the PR-017/D2 currency work reads).
- **Governance rules**, all keyed by `clientId` with an all-clients fallback:
  `ApprovalMatrix`, `AutoAdjudicationPolicy`, `ProviderTariff` overrides,
  `ContractApplicability`. This is *why* the approval matrix and auto-adjudication
  resolve "client-specific rule beats all-clients rule."
- **Hierarchy** (`parentClientId`/`subsidiaries`) — a regional insurer with
  country subsidiaries.

`Group` owns everything that is **per-scheme**: the benefit `package`,
`contributionRate`, `broker`, `fundingMode` (INSURED / SELF_FUNDED),
`effectiveDate`/`renewalDate`, suspension state.

`Member` owns everything that is **per-life**: identity, `relationship`,
inherited `package`, cover dates, lifecycle status.

Each tier holds a different thing; none repeats another. The one field that
appears at several tiers — `currency` — is intentional layering (payer default
→ scheme override → transaction stamp), not duplication.

## The case that *looks* like duplication (and why it isn't a problem)

A small operator that administers a **single** payer has exactly one Client
(slug `default`). Every Group auto-attaches to it via
`resolveSchemeClientId()`, so the Client tier is invisible plumbing and it can
feel redundant.

But the target of this engagement — onboarding a **10,000-life corporate with a
network of schemes** — is precisely the multi-payer case the tier exists for:
an insurer (Client) that owns many employer groups (Groups), each with its own
package, broker and funding mode, all under one payer's numbering, branding,
currency, approval matrix and auto-adjudication policy. Collapsing Client into
Group would make those payer-level rules un-scopable and break cross-payer
isolation.

**Conclusion:** keep `Client`. It is the payer tier above the scheme tier — a
standard, necessary TPA abstraction, not a duplicate of Group. No fields need
redistributing; each of the four tiers is holding the right data.
