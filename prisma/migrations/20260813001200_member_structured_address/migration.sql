-- UAT-HF P05.06 — DEF-033.
--
-- Additive, nullable columns only: no existing member is assigned an invented
-- location and no backfill is required. Coordinates are deliberately separate
-- from the postal/administrative hierarchy because they carry a stricter
-- consent requirement at the application boundary.

ALTER TABLE "Member" ADD COLUMN "addressCountry"             TEXT;
ALTER TABLE "Member" ADD COLUMN "addressDistrict"            TEXT;
ALTER TABLE "Member" ADD COLUMN "addressLocality"            TEXT;
ALTER TABLE "Member" ADD COLUMN "addressSubcounty"           TEXT;
ALTER TABLE "Member" ADD COLUMN "addressParish"              TEXT;
ALTER TABLE "Member" ADD COLUMN "addressVillage"             TEXT;
ALTER TABLE "Member" ADD COLUMN "addressLine"                TEXT;
ALTER TABLE "Member" ADD COLUMN "addressLatitude"            DECIMAL(9,6);
ALTER TABLE "Member" ADD COLUMN "addressLongitude"           DECIMAL(9,6);
ALTER TABLE "Member" ADD COLUMN "addressCoordinateConsentAt" TIMESTAMP(3);

ALTER TABLE "Member" ADD CONSTRAINT "member_address_coordinates_pair"
  CHECK (("addressLatitude" IS NULL) = ("addressLongitude" IS NULL));

ALTER TABLE "Member" ADD CONSTRAINT "member_address_coordinates_consent"
  CHECK (
    ("addressLatitude" IS NULL AND "addressCoordinateConsentAt" IS NULL)
    OR
    ("addressLatitude" IS NOT NULL AND "addressCoordinateConsentAt" IS NOT NULL)
  );

ALTER TABLE "Member" ADD CONSTRAINT "member_address_latitude_range"
  CHECK ("addressLatitude" IS NULL OR "addressLatitude" BETWEEN -90 AND 90);

ALTER TABLE "Member" ADD CONSTRAINT "member_address_longitude_range"
  CHECK ("addressLongitude" IS NULL OR "addressLongitude" BETWEEN -180 AND 180);
