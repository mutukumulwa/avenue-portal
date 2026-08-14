-- UAT-HF P10.08 — AuditLog.userId becomes nullable.
--
-- The NOT NULL forced two security events to go UNRECORDED rather than merely
-- unattributed: a sign-in attempt against an address with no account (nothing
-- to point the FK at), and a source address hitting the rate limit (a control
-- that fires across accounts by design, so attaching it to one would be a
-- fiction).
--
-- Dropping NOT NULL is additive and reversible while no null rows exist. It
-- widens no existing row and rewrites no data: Postgres records the dropped
-- constraint in the catalogue without touching the heap.

-- AlterTable
ALTER TABLE "AuditLog" ALTER COLUMN "userId" DROP NOT NULL;
