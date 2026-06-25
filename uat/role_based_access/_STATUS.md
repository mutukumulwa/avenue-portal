# Role-based access testing — STATUS: BLOCKED (no login possible)

Per-role testing (plan §2.3, one file per role) **could not be executed**: no browser and no ability to log in (no runtime; credential entry out of scope for this agent). None of the 11 seeded role accounts were exercised.

The only role-relevant evidence gathered is **unauthenticated** route-guard behaviour, recorded in [../workflows/WF01_authentication_routing.md](../workflows/WF01_authentication_routing.md) and [../security_permissions/SEC01_unauthenticated_surface.md](../security_permissions/SEC01_unauthenticated_surface.md):
- Admin/broker/fund/hr protected routes redirect server-side to `/login` when unauthenticated ✅
- `/member/dashboard` returns 200 unauthenticated (client-side guard only) — DEF-004 🟠

**Still required (all roles):** login → correct landing; allowed vs restricted actions; record visibility/scope; cross-role denial via UI nav, direct URL, and API mutation; IDOR; cross-broker/cross-employer/cross-member isolation; notification targeting; export scoping. See the RBAC matrix in plan §2.2 and [../unresolved_questions/UQ_blocked_scope.md](../unresolved_questions/UQ_blocked_scope.md).
