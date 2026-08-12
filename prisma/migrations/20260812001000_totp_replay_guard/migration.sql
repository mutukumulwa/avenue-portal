-- UAT-HF P10.03 — one-time-use enforcement for TOTP.
--
-- DEF-013: "A code was used to sign in successfully; after logout the SAME code
-- was submitted again in a brand-new browser profile and was ACCEPTED, opening
-- a second authenticated session. The code was still inside its 30-second time
-- step; with the accepted plus-or-minus one step drift tolerance the replay
-- window is up to roughly 90 seconds. There is no one-time-use enforcement."
--
-- NULL means "no code spent yet", so every existing user's first sign-in after
-- this migration is accepted normally and starts their counter. Nobody is
-- locked out by the backfill, because there is no backfill to get wrong.

ALTER TABLE "User" ADD COLUMN "lastTotpCounter" INTEGER;
