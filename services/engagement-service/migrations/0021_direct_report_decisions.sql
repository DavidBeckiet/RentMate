ALTER TABLE contact_report_events
  DROP CONSTRAINT ck_contact_report_events_status;

ALTER TABLE contact_report_events
  ADD CONSTRAINT ck_contact_report_events_status CHECK (
    (
      event_type = 'STATUS'
      AND subject_type IS NULL
      AND subject_id IS NULL
      AND (
        (previous_status IS NULL AND actor_role IN ('TENANT', 'LANDLORD') AND new_status = 'OPEN')
        OR (
          previous_status = 'OPEN'
          AND actor_role = 'ADMIN'
          AND new_status IN ('INVESTIGATING', 'RESOLVED', 'DISMISSED')
        )
        OR (
          previous_status = 'INVESTIGATING'
          AND actor_role = 'ADMIN'
          AND new_status IN ('RESOLVED', 'DISMISSED')
        )
      )
    )
    OR (
      event_type IN ('SUBJECT_HIDDEN', 'SUBJECT_RESTORED')
      AND actor_role = 'ADMIN'
      AND previous_status IS NULL
      AND new_status = event_type
      AND subject_type IN ('ROOMMATE_PROFILE', 'ROOMMATE_REQUEST', 'ROOMMATE_MESSAGE')
      AND subject_id IS NOT NULL
      AND subject_id > 0
    )
  );

ALTER TABLE review_report_events
  DROP CONSTRAINT ck_review_report_events_status;

ALTER TABLE review_report_events
  ADD CONSTRAINT ck_review_report_events_status CHECK (
    (previous_status IS NULL AND actor_role IN ('TENANT', 'LANDLORD') AND new_status = 'OPEN')
    OR (previous_status = 'OPEN' AND actor_role = 'ADMIN' AND new_status IN ('INVESTIGATING', 'RESOLVED', 'DISMISSED'))
    OR (previous_status = 'INVESTIGATING' AND actor_role = 'ADMIN' AND new_status IN ('RESOLVED', 'DISMISSED'))
  );
