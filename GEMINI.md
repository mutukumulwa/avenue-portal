# GEMINI.md

## Project

Medvex — Third Party Administrator (TPA) health-benefits platform, Uganda.

## Planning

- Always use Plan Mode for any task touching more than 2 files
- Before writing code, read `AICARE_ANTIGRAVITY_BUILD_SPEC.md` for the relevant module specification
- Before styling any component, read `Medvex_Style_Guide.md` for brand colors, fonts, and component patterns
- Break large features into subtasks: schema → service → router → UI → tests

## Code Generation

- TypeScript strict mode — no `any` types unless absolutely necessary (and add a comment explaining why)
- Prefer `const` over `let`; never use `var`
- Use async/await — never raw Promise chains
- All Prisma queries must include `where: { tenantId }` — never query without tenant scope
- When creating a new tRPC router, register it in `src/server/trpc/router.ts`
- When adding a new page, ensure the route is protected by auth middleware checking the user's role

## Testing

- After creating any service or router, generate corresponding test files in `tests/`
- Use Vitest for unit tests
- Test happy path, validation errors, authorization failures, and edge cases

## Browser Testing

- After building a UI feature, use the browser to navigate to it, take a screenshot, and verify it renders correctly
- Check that Medvex brand colors are applied (ink `#0B1437`, teal accent `#06B9AB`, body text `#41505E`, pill buttons)
- Verify tables are populated with seed data

## Docker

- After major milestones, verify `docker-compose up` still works
- Run `npx prisma migrate dev` after any schema change
- Run `npx prisma db seed` to verify seed data loads cleanly

## Do NOT

- Do not install packages without checking if an existing dependency already covers the need
- Do not create separate CSS files — use Tailwind utility classes
- Do not use `localStorage` for auth tokens — use NextAuth.js sessions
- Do not skip the AuditLog — every write operation must be logged
- Do not use `float` or `number` for monetary values — always `Decimal`
