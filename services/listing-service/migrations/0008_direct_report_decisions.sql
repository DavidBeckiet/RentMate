ALTER TABLE listing_report_events
  DROP CONSTRAINT ck_listing_report_events_status;

ALTER TABLE listing_report_events
  ADD CONSTRAINT ck_listing_report_events_status CHECK (
    (previous_status IS NULL AND actor_role = 'TENANT' AND new_status = 'OPEN')
    OR (previous_status = 'OPEN' AND actor_role = 'ADMIN' AND new_status IN ('INVESTIGATING', 'RESOLVED', 'DISMISSED'))
    OR (previous_status = 'INVESTIGATING' AND actor_role = 'ADMIN' AND new_status IN ('RESOLVED', 'DISMISSED'))
  );
