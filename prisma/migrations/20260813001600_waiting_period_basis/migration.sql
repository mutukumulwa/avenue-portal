-- UAT-HF P09.03 — DEF-022: store what a waiting period is measured from.
--
-- "The product never states what the 270 days run FROM — cover start,
-- enrolment date, policy inception and member join date are all plausible and
-- none is named."
--
-- Additive and non-breaking. The default is COVER_START, which is exactly what
-- the evaluator already computed, so every existing row keeps its current
-- meaning and there is no backfill to get wrong.

CREATE TYPE "WaitingPeriodBasis" AS ENUM ('COVER_START', 'DEPENDANT_JOIN', 'REINSTATEMENT', 'OTHER_APPROVED');

ALTER TABLE "BenefitConfig"
  ADD COLUMN "waitingPeriodBasis" "WaitingPeriodBasis" NOT NULL DEFAULT 'COVER_START';
