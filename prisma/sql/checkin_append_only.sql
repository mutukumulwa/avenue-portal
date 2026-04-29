CREATE OR REPLACE FUNCTION prevent_checkin_event_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'CheckInEvent is append-only. Create a compensating event instead.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS checkin_event_append_only ON "CheckInEvent";

CREATE TRIGGER checkin_event_append_only
BEFORE UPDATE OR DELETE ON "CheckInEvent"
FOR EACH ROW
EXECUTE FUNCTION prevent_checkin_event_mutation();
