# UAT Action Plan & Tracking

This document tracks the resolution of defects identified during UAT (see `DEFECTS.md`). Agents should update the status of each task to `[x]` or `[/]` as they progress, to ensure all agents share the same context.

## Phase 1: High Priority Cross-Cutting Issues & Blockers (S2)
- [x] **Task 1.1**: Fix PDF Generation (DEFECT-001, DEFECT-005). Investigate `@react-pdf/renderer` or `puppeteer` usage in serverless functions (Digest 2671985791).
- [x] **Task 1.2**: Fix Server Action Crashes Post-Success (DEFECT-009, DEFECT-010a, DEFECT-016). Investigate missing returns, redirects, or `revalidatePath` issues in these actions.
- [x] **Task 1.3**: Fix Settlement Workflow (DEFECT-010b, DEFECT-010c). Fix maker self-approve crash (add validation message) and implement "Paid" button functionality.

## Phase 2: Missing Features, State Updates, & Stale Deployments (S3/S2)
- [x] **Task 2.1**: Implement pending/disabled states and success redirects for Create Group / Enroll (DEFECT-003, DEFECT-007) to prevent double submission and provide feedback.
- [x] **Task 2.2**: Implement "Create Model" button handler for Pricing Models (DEFECT-004).
- [x] **Task 2.3**: Fix Quotation Prospect Name mapping on detail page (DEFECT-006).
- [ ] **Task 2.4**: Fix Analytics Renewals drill-down link (DEFECT-012).
- [x] **Task 2.5**: Auto-initialise fund accounts for self-funded schemes or handle missing ledger KPIs (DEFECT-015).
- [ ] **Task 2.6**: Seed missing documents to `public/seed-docs/` (DEFECT-017).
- [ ] **Task 2.7**: Deployment: Push local commits (`d8c4661`) and redeploy to Vercel (DEFECT-014).

## Phase 3: Cosmetic & Minor Routing (S4)
- [ ] **Task 3.1**: Clean up empty scaffold routes in Admin Members & Groups (DEFECT-002).
- [ ] **Task 3.2**: Fix pluralization "0 lifes" to "lives" (DEFECT-008).
- [ ] **Task 3.3**: Fix grammar "1 scheme have" and blank header "— · —" (DEFECT-011).
- [ ] **Task 3.4**: Fix HR portal nav prefetch 404 for `/hr` by redirecting to `/hr/dashboard` (DEFECT-013).
- [ ] **Task 3.5**: Create a branded 404 page (DEFECT-018).

## Phase 4: Re-testing
- [ ] **Task 4.1**: Retest claims import and fund statement post-deployment.
- [ ] **Task 4.2**: Verify all previously crashing server actions.
