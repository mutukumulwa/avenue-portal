# Medvex TPA — Infrastructure BOM & 12-Month Cost Projection

**Date:** 2026-07-05 (rev. B — Uganda-first) · **Scope:** 2,000+ facilities, 10,000+ lives, ≥2 clients (tenants). **First client is in Uganda; the rollout region of record is Uganda** (the codebase already carries the Uganda integrations: MTN MoMo, Airtel Money, NIRA ID checks — see AICARE_TPA_UGANDA_SPEC.md).
**Basis:** Component inventory derived from this repo (package.json, docker-compose.yml, Dockerfile, docs/INSTALL.md, src/server/jobs, src/server/services/integrations). Pricing researched 2026-07-05; FX assumed ≈ UGX 3,650/USD, KES 130/USD, EUR 1.09/USD.

---

## 1. System profile & workload model

The platform is a multi-tenant TPA core: Next.js 15 (standalone) + tRPC app, a **separate always-on BullMQ worker** (19 recurring job families: billing runs, fraud scans, escalations, offline packs, analytics refresh, commission calc, etc.), PostgreSQL (175 Prisma models, audit-chain heavy), Redis, S3-compatible object storage (MinIO client), Chromium/Puppeteer PDF rendering, nginx, SMTP, SMS low-bandwidth channel, and mobile-money integrations (M-Pesa, Airtel Money, MTN MoMo, DPO, NIRA ID checks).

Sizing assumptions at target scale:

| Driver | Assumption | Implication |
|---|---|---|
| Lives | 10,000 across ≥2 tenants | Small in DB terms |
| Claim encounters | ~1.5–2.5 OP visits/life/yr + IP ⇒ **40–80k claims/yr** (~250–500/working day, month-end peaks 2–3×) | Modest OLTP load |
| Facility users | 2,000 accounts; realistic peak concurrency 5–10% ⇒ **100–250 concurrent sessions** + 30–80 TPA back-office | ~10–30 req/s steady, 100–150 req/s bursts |
| DB growth | Audit chain + analytics snapshots dominate ⇒ **20–50 GB year 1** | 500 GB provisioned is generous |
| Object storage | Claim scans 3–8 MB/claim + contracts + offline packs + generated PDFs ⇒ **~0.5 TB by month 12** (provision 1 TB) | Storage is cheap everywhere; egress is not |
| PDF rendering | Chromium spikes 300–500 MB/render | Worker needs 8–16 GB RAM headroom |
| Availability | Claims adjudication + preauth are business-hours-critical; offline packs already mitigate facility-side outages | HA on DB + 2× app; 99.9% target is sufficient |

This capacity envelope carries ~5× growth (≈50k lives, 5–8 clients) before re-architecture; PostgreSQL is the first scaling bottleneck, and it scales vertically for a long time.

---

## 2. Software BOM (licence cost: $0)

| Component | Version | Role | Licence note |
|---|---|---|---|
| Node.js | ≥20 | Runtime (app + worker) | MIT-ish (OpenJS) |
| Next.js / React / tRPC / Prisma | 15 / 19 / 11 / 7 | App tier | MIT / Apache-2.0 |
| PostgreSQL | ≥15 (16 in compose) | Primary datastore | PostgreSQL licence |
| Redis | ≥6 (7 in compose) | BullMQ queues, cache | RSALv2/SSPL — fine for internal use; Valkey (BSD) is a drop-in if licence posture matters |
| MinIO | latest | S3-compatible object store | **AGPLv3; community edition was gutted in 2025 (console removed).** For self-host, prefer Garage/SeaweedFS or paid MinIO; in cloud, use native S3/GCS/R2 — the app only needs the S3 API |
| Chromium (Puppeteer 24/25 + @sparticuz/chromium) | pinned | PDF rendering | BSD |
| nginx | stable | TLS termination / reverse proxy | BSD |
| Docker + Compose | current | Packaging (Dockerfile is multi-stage, standalone output) | Apache-2.0 |

**There are no software licence fees in any scenario.** All cost differences are compute, storage, network, managed-service margin, and people.

---

## 3. Environment topology

- **Production** (HA): 2× app, 1× worker, Postgres primary + standby/PITR, Redis, object storage, LB.
- **UAT/staging** (exists today as `aicare_uat`): one node running the whole compose stack + small DB.
- **DR:** daily logical dump + WAL/PITR archive, offsite copy. Target RPO ≤ 15 min, RTO ≤ 4 h.
- Both clients ride one multi-tenant stack (tenantId isolation is native). A contractually-demanded dedicated DB per client adds ~$150–450/mo per client depending on option — noted where material.

## 4. Capacity BOM (vendor-neutral)

| # | Role | Spec | Prod qty | UAT qty |
|---|---|---|---|---|
| 1 | App node | 4 vCPU / 16 GB | 2 | — |
| 2 | Worker node (BullMQ + Chromium) | 4 vCPU / 16 GB | 1 | — |
| 3 | PostgreSQL | 4 vCPU / 16–32 GB, 500 GB NVMe, PITR | 1 + standby | shared node |
| 4 | Redis | 1–2 GB | 1 | shared node |
| 5 | Object storage | 1 TB, versioned | 1 | 100 GB |
| 6 | LB / nginx edge | small | 1 | — |
| 7 | UAT all-in-one | 8 vCPU / 32 GB, 500 GB | — | 1 |
| 8 | Monitoring/backup target | small VM + offsite bucket | 1 | — |

**Total prod footprint: ~16–20 vCPU, 64–96 GB RAM, ~1.5 TB NVMe, 1 TB object storage.** This is a small system; the cost story is dominated by *how* you buy it, not how much.

---

## 5. Option A — Self-sourced hardware, self-hosted (Kampala colocation)

In-country for the first client means **Kampala**, and there is one obvious venue: **Raxio UG1 (Namanve Industrial Park)** — Uganda's first Tier III, carrier- and cloud-neutral facility, 4–21 kW/rack, pricing by RFQ. Fallback/secondary site: iColo/ADC Nairobi (useful as DR that stays in East Africa, and relevant if the second client is Kenyan). East-African retail colo rates are broadly similar; the model below uses the same $250–450/kW/mo band for both cities.

### CapEx BOM

| Item | Spec | Qty | Unit (USD) | Total |
|---|---|---|---|---|
| Server (Dell R660xs or equiv.) | 2× Xeon 16c, 256 GB DDR5, 2× 1.92 TB NVMe (RAID1) + 2× 3.84 TB, dual PSU | 2 | ~9,000 (new; barebones CTO seen at ~$4.4k, configured new $8–14k; refurb ~45% less) | 18,000 |
| Firewall/edge pair | 2× 1U OPNsense-class | 2 | 750 | 1,500 |
| Switch, PDUs, rails, cables, spares kit (1 PSU, 2 drives, DIMMs) | — | — | — | 3,500 |
| **CapEx total** | | | | **~23,000** (refurb path: ~13–15k) |

Two servers run everything virtualised (Proxmox): node 1 = app×2 + Postgres primary + Redis; node 2 = worker + Postgres standby + object store + UAT. No SAN — local NVMe + streaming replication.

### Monthly OpEx

| Item | Basis | USD/mo |
|---|---|---|
| Colocation, ~2 kW quarter-rack (Raxio UG1 Kampala) | Not publicly listed; East-Africa going rate ~$250–450/kW/mo → **RFQ required** | 600–950 |
| DIA bandwidth 100 Mbps + cross-connects | Kampala DIA market rate (Raxio is carrier-neutral; MTN/Airtel/Liquid on-site) | 200–450 |
| Offsite backup (B2/S3, ~1 TB) | ~$6/TB | 10–30 |
| Ops staffing, 0.5 FTE DevOps/SRE (Kampala/Nairobi mid-senior, remote-capable) | $4–6k FTE | 2,000–3,000 |
| **OpEx total** | | **~2,800–4,400** |

### Year-1 cash: **≈ $58–72k** (≈ UGX 212–263M / KES 7.5–9.4M) — CapEx $23k + OpEx ~$35–49k. Year-2 run rate ≈ $35–50k.

### Option A′ — Rented dedicated (Hetzner, post-June-2026 prices)
2× AX102 (€124 ea) + AX52 (€64) + backup/IP add-ons ≈ **€390/mo ≈ $425/mo = ~$5.1k/yr** + 0.3 FTE ops (~$14k) ⇒ **~$19–22k/yr all-in.** Cheapest option on the sheet, **but data sits in Germany/Finland — almost certainly incompatible with Kenyan health-data localisation (see §8).** Viable only for UAT/DR replicas if counsel agrees.

---

## 6. Option B — Hyperscalers (nearest regions: Cape Town / Johannesburg)

All figures = prod (HA) + UAT, monthly, after 1-year commitments; on-demand ≈ +30–40%.

### B1. AWS af-south-1 (Cape Town) — researched rates
m6i.xlarge OD $185.42/mo, 1-yr RI ~$117/mo; egress $0.154/GB after 100 GB free.

| Line | Detail | USD/mo |
|---|---|---|
| App ×2 | m6i.xlarge, 1-yr RI | 234 |
| Worker | m6i.xlarge, 1-yr RI | 117 |
| RDS PostgreSQL Multi-AZ | db.m6i.xlarge (est. $0.47/hr single-AZ af-south-1 = us-east-1 $0.356 × ~1.32 regional premium), ×2 Multi-AZ, ~-30% RI | ~470 |
| RDS storage + backups | 500 GB gp3 ~$0.15/GB + PITR | ~90 |
| ElastiCache Redis | cache.t4g.medium | ~65 |
| S3 | ~500 GB avg yr-1 @ ~$0.0274/GB | 15 |
| ALB + NAT + egress | egress ~400 GB/mo @ $0.154 | ~140 |
| CloudWatch, WAF, Secrets, SNS | | ~80 |
| UAT | t3.large + db.t3.large single-AZ + 100 GB | ~260 |
| **AWS total** | | **~1,470/mo ⇒ ~$17.6k/yr** (on-demand ≈ $23k) |

### B2. GCP africa-south1 (Johannesburg) — researched rates
n2-standard-4 = $124.81/mo OD (notably cheaper than AWS af-south-1); 1-yr CUD ≈ −37%.

| Line | USD/mo |
|---|---|
| 3× n2-standard-4 (app ×2 + worker), 1-yr CUD | ~236 |
| Cloud SQL PostgreSQL Enterprise 4 vCPU/16 GB **HA** + 500 GB SSD | ~570 |
| Memorystore Redis 1 GB | ~36 |
| GCS ~500 GB + LB + egress (~$0.12/GB) + ops suite | ~135 |
| UAT: e2-standard-4 + small Cloud SQL | ~260 |
| **GCP total** | **~1,240/mo ⇒ ~$14.9k/yr** |

### B3. Azure South Africa North (Johannesburg)
D4s_v5 ≈ $140/mo (US) +15–25% ZA premium, 1-yr reserved ≈ −40%; PG Flexible D4ds_v5 $259.88 PAYG US / $156 reserved, + ZA premium, ×2 for zone-redundant HA.

| Line | USD/mo |
|---|---|
| 3× D4s_v5 reserved | ~315 |
| PG Flexible Server 4 vCore HA reserved + 500 GB | ~530 |
| Cache, blob, LB, egress, monitor | ~250 |
| UAT | ~280 |
| **Azure total** | **~1,375/mo ⇒ ~$16.5k/yr** |

**Hyperscaler summary: $15–18k/yr infra committed, $20–26k uncommitted**, + 0.25 FTE ops (~$12–15k/yr). GCP Johannesburg is currently the cheapest hyperscaler seat; AWS Cape Town carries a ~32% regional premium over US East.

---

## 7. Option C — Managed-PaaS blend (the team's current tooling trajectory: Vercel + Supabase)

**Architectural constraint:** the BullMQ worker and Puppeteer rendering are long-running processes — they **cannot run on Vercel serverless**. The blend must include one small always-on VM (or Fly.io/Railway service) for the worker, which can also host Redis (AOF-persisted) to avoid per-command managed-Redis billing that BullMQ's chatty polling would inflate.

| Line | Detail | USD/mo |
|---|---|---|
| Vercel Pro | 2 seats @ $20 + fluid-compute usage at this traffic (1 TB bw incl.) | 90–150 |
| Supabase | Pro $25 + Large compute (8 GB) $110 + PITR ~$100 + storage/egress | 250–280 |
| — or Supabase Team (SOC2 report, 14-day backups) | replaces above base with $599 + compute | (+~470) |
| Worker VM | m6i.large RI af-south-1 ($58) or Fly.io 2×4 GB, + EBS; Redis colocated | 70–100 |
| Object storage | Cloudflare R2 ($0.015/GB, **zero egress**) ~500 GB avg | 8–15 |
| Email (SES/Resend) + monitoring (Sentry team, Grafana Cloud free tier) | | 50–90 |
| **Blend total** | | **~470–640/mo ⇒ ~$5.6–7.7k/yr** (with Supabase Team: ~$11–13k/yr) |

Supabase deploys in **AWS af-south-1 (Cape Town)** and Vercel functions can pin to `cpt1`, so the blend can keep data on the continent — same residency status as Option B, not better.

Ops burden is genuinely lower here: ~0.1–0.15 FTE (~$5–8k/yr).

---

## 8. Cross-cutting costs (all options) & compliance gate

| Item | Basis | Year-1 USD |
|---|---|---|
| SMS (member notifications + low-bandwidth BAL/VISITS/LOC channel + OTPs) | ~200–300k SMS/yr across both clients @ ~UGX 25–35/SMS in Uganda (Africa's Talking; Kenya leg ~KES 0.4–0.6 if/when a Kenyan book goes live) | 1,500–2,900 |
| Email | SES-class, ~100k/yr | ~60 |
| Domains, TLS (Let's Encrypt) | | ~60 |
| Annual penetration test (insurers will ask) | one per year | 5,000–12,000 |
| Contingency | 15% of infra | varies |
| Mobile-money & DPO fees | transaction-level (MTN MoMo / Airtel Money tariffs, DPO ~3–3.5%; M-Pesa for any Kenyan book) | **pass-through, not infra** |

**Compliance gate — Uganda first:** the governing law for client 1 is Uganda's **Data Protection and Privacy Act 2019** (enforced by the PDPO under NITA-U) and its 2021 Regulations. It does **not impose blanket data localisation**: personal data may be processed outside Uganda where the destination offers **adequate safeguards equivalent to the Act, or with data-subject consent**. So an SA-region cloud (Cape Town/Johannesburg) is legally attainable with the right paperwork — PDPO registration, DPAs with each provider, transfer-safeguard language in member onboarding, and the client's sign-off. Practical caveats that can still force in-country hosting: Ministry of Health digital-health guidelines and NITA-U certification expectations for health-sector systems, and the client's own board/regulator (IRA Uganda) posture. Also note latency: Kampala→Cape Town is ~100 ms+ RTT (fine for a portal; the offline-pack design already absorbs worse). If any future client is Kenyan, Kenya's **Digital Health Act 2023 localisation provisions** are stricter and would re-open this question for that tenant's data.
- **If cross-border with safeguards clears PDPO/client review** → Option C or B is open.
- **If in-country is mandated** → Option A at Raxio Kampala (or NITA-U national data centre for public-sector-linked schemes) is the compliant path; the hyperscaler column drops out for prod data.

---

## 9. 12-month projection (Year 1, USD, incl. ops staffing + comms; pentest & contingency excluded)

| Scenario | Infra Y1 | Ops staffing Y1 | Comms/misc | **Year-1 total** | **≈ KES / UGX** | Y2+ run rate | $/member/mo (PMPM) |
|---|---|---|---|---|---|---|---|
| **A. Self-sourced, Kampala colo (Raxio UG1)** | 23k CapEx + 12–17k colo/bw/backup | 24–36k (0.5 FTE) | 2k | **~$61–78k** | 7.9–10.1M / 223–285M | ~$38–52k | ~$0.51–0.65 |
| **A′. Hetzner dedicated (residency risk)** | ~5.1k | 14k (0.3 FTE) | 2k | **~$21k** | 2.7M / 77M | ~$21k | ~$0.18 |
| **B1. AWS Cape Town (1-yr RI)** | ~17.6k | 12–15k (0.25 FTE) | 2k | **~$32–35k** | 4.2–4.6M / 117–128M | similar | ~$0.27 |
| **B2. GCP Johannesburg (1-yr CUD)** | ~14.9k | 12–15k | 2k | **~$29–32k** | 3.8–4.2M / 106–117M | similar | ~$0.25 |
| **B3. Azure ZA North (reserved)** | ~16.5k | 12–15k | 2k | **~$31–34k** | 4.0–4.4M / 113–124M | similar | ~$0.26 |
| **C. Blend: Vercel + Supabase + worker VM + R2** | ~5.6–7.7k (Team plan: +5k) | 5–8k (0.1–0.15 FTE) | 2k | **~$13–18k** | 1.7–2.3M / 47–66M | ~$13–18k | ~$0.11–0.15 |

Monthly ramp assumption: months 1–3 = UAT + prod standing up with client 1 (≈60% of run rate), months 4–12 = full dual-client load. The table above conservatively charges the full run rate for all 12 months, so it carries its own buffer.

## 10. Recommendation

1. **Resolve the residency question first** (§8) — for Uganda this means a PDPO/counsel opinion on cross-border transfer with safeguards, plus the client's own sign-off. It is the only variable that moves the answer by 4×, and Uganda's DPPA makes the favourable outcome genuinely attainable.
2. **If cross-border with safeguards clears:** run **Option C** hardened — Supabase Pro + Large compute + PITR in af-south-1 (upgrade to Team when a client's DD asks for SOC2 artifacts), Vercel `cpt1`, one reserved m6i.large in af-south-1 for worker + Redis, R2 for documents. **~$13–18k year 1**, lowest ops load, and it matches the tooling already in use. Keep the Docker/compose path warm as the exit ramp.
3. **If in-country is mandated:** budget **~$65k year 1** for the Kampala colo build at Raxio UG1 (Option A) — get the Raxio RFQ before buying hardware, and price any NITA-U-certified local cloud against it. Use Hetzner only for encrypted offsite backup/DR if counsel allows.
4. **Full hyperscaler (Option B)** is the middle path you grow into when you outgrow C (≈50k+ lives or enterprise-client compliance demands), not the place to start — at this scale you'd pay ~2× C for headroom you don't yet use. GCP Johannesburg is the cheapest of the three majors today.
5. At these volumes infrastructure is **$0.10–0.64 PMPM** — noise against TPA admin fees. Decide on compliance, ops capacity, and credibility with client auditors, not on the infra delta.

---

## Appendix: key researched price points (2026-07-05)

- AWS af-south-1: m6i.xlarge $0.254/hr OD ($185.42/mo), 1-yr RI $0.16/hr; m6i.large $92.71/mo OD; m6i.2xlarge $370.84/mo OD; t3.medium $39.57/mo (ec2.shop regional API)
- AWS af-south-1 egress: $0.154/GB after first 100 GB
- GCP africa-south1: n2-standard-4 $124.81/mo, e2-standard-4 $107.62/mo OD
- Azure: D4s_v5 from $140.16/mo (US baseline, ZA +15–25%); PG Flexible D4ds_v5 $259.88 PAYG / $155.99 1-yr (US baseline)
- Hetzner (post-June-2026 adjustment): AX52 €64/mo; AX102 128 GB €124/mo
- Supabase: Pro $25 + compute Micro $10 → Large $110 (8 GB) → XL $210 (16 GB); Team $599
- Vercel: Pro $20/seat, $0.128/active-CPU-hr, $0.15/GB bw overage, 1 TB included
- Dell R660xs: barebones CTO ~$4.4k, configured new ~$8–14k
- Africa's Talking SMS: Uganda ~UGX 25–35/SMS; Kenya ~KES 0.40–0.60/SMS
- Kampala colocation: Raxio UG1 (Namanve) — Tier III, carrier/cloud-neutral, 4–21 kW/rack, RFQ-only pricing; Nairobi fallback (iColo/ADC) likewise RFQ-only; both modelled at $250–450/kW/mo
- Uganda DPPA 2019 + 2021 Regulations: cross-border processing permitted with adequate safeguards equivalent to the Act or data-subject consent; PDPO (under NITA-U) is the regulator
