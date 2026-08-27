CREATE TABLE roommate_profiles (
  tenant_id integer PRIMARY KEY,
  intro text NOT NULL,
  sleep_schedule varchar(16) NOT NULL,
  cleanliness_level varchar(16) NOT NULL,
  noise_preference varchar(16) NOT NULL,
  smoking_environment varchar(16) NOT NULL,
  pet_environment varchar(16) NOT NULL,
  moderation_state varchar(16) NOT NULL DEFAULT 'VISIBLE',
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_roommate_profiles_tenant CHECK (tenant_id > 0),
  CONSTRAINT ck_roommate_profiles_intro CHECK (
    intro = btrim(intro) AND char_length(intro) BETWEEN 20 AND 500
  ),
  CONSTRAINT ck_roommate_profiles_sleep CHECK (
    sleep_schedule IN ('EARLY', 'STANDARD', 'LATE', 'FLEXIBLE')
  ),
  CONSTRAINT ck_roommate_profiles_cleanliness CHECK (
    cleanliness_level IN ('RELAXED', 'BALANCED', 'TIDY')
  ),
  CONSTRAINT ck_roommate_profiles_noise CHECK (
    noise_preference IN ('QUIET', 'BALANCED', 'SOCIAL')
  ),
  CONSTRAINT ck_roommate_profiles_smoking CHECK (
    smoking_environment IN ('SMOKE_FREE', 'OUTDOOR_ONLY', 'NO_PREFERENCE')
  ),
  CONSTRAINT ck_roommate_profiles_pet CHECK (
    pet_environment IN ('NO_PETS', 'OK_WITH_PETS', 'HAS_PET')
  ),
  CONSTRAINT ck_roommate_profiles_moderation CHECK (moderation_state IN ('VISIBLE', 'HIDDEN')),
  CONSTRAINT ck_roommate_profiles_timestamps CHECK (updated_at >= created_at)
);

CREATE INDEX idx_roommate_profiles_moderation
  ON roommate_profiles (moderation_state, updated_at DESC, tenant_id);

CREATE TABLE roommate_requests (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_tenant_id integer NOT NULL,
  listing_id integer,
  preferred_area_keys text[] NOT NULL DEFAULT '{}',
  budget_min_per_person bigint NOT NULL,
  budget_max_per_person bigint NOT NULL,
  move_in_from date NOT NULL,
  move_in_until date NOT NULL,
  note varchar(500),
  status varchar(16) NOT NULL DEFAULT 'OPEN',
  expires_at timestamptz NOT NULL,
  listing_linked_at timestamptz,
  moderation_state varchar(16) NOT NULL DEFAULT 'VISIBLE',
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_roommate_requests_owner CHECK (owner_tenant_id > 0),
  CONSTRAINT ck_roommate_requests_listing CHECK (listing_id IS NULL OR listing_id > 0),
  CONSTRAINT ck_roommate_requests_area_count CHECK (
    cardinality(preferred_area_keys) BETWEEN 0 AND 5
    AND array_position(preferred_area_keys, NULL) IS NULL
    AND NOT ('' = ANY (preferred_area_keys))
  ),
  CONSTRAINT ck_roommate_requests_budget CHECK (
    budget_min_per_person BETWEEN 1 AND 999999999999
    AND budget_max_per_person BETWEEN 1 AND 999999999999
    AND budget_max_per_person >= budget_min_per_person
  ),
  CONSTRAINT ck_roommate_requests_move_window CHECK (
    move_in_until >= move_in_from
    AND move_in_until <= move_in_from + 90
  ),
  CONSTRAINT ck_roommate_requests_note CHECK (
    note IS NULL OR (note = btrim(note) AND char_length(note) BETWEEN 1 AND 500)
  ),
  CONSTRAINT ck_roommate_requests_status CHECK (status IN ('OPEN', 'MATCHED', 'CANCELLED', 'EXPIRED')),
  CONSTRAINT ck_roommate_requests_expiry CHECK (expires_at > created_at),
  CONSTRAINT ck_roommate_requests_listing_linked_at CHECK (
    (listing_id IS NULL AND listing_linked_at IS NULL)
    OR (listing_id IS NOT NULL AND listing_linked_at IS NOT NULL)
  ),
  CONSTRAINT ck_roommate_requests_moderation CHECK (moderation_state IN ('VISIBLE', 'HIDDEN')),
  CONSTRAINT ck_roommate_requests_timestamps CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX uq_roommate_requests_open_owner
  ON roommate_requests (owner_tenant_id)
  WHERE status = 'OPEN';

CREATE INDEX idx_roommate_requests_discovery
  ON roommate_requests (status, moderation_state, expires_at, created_at DESC, id DESC);

CREATE INDEX idx_roommate_requests_owner_created
  ON roommate_requests (owner_tenant_id, created_at DESC, id DESC);

CREATE INDEX idx_roommate_requests_listing
  ON roommate_requests (listing_id, created_at DESC, id DESC)
  WHERE listing_id IS NOT NULL;

CREATE TABLE roommate_interests (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id integer NOT NULL,
  interested_tenant_id integer NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'PENDING',
  accepted_at timestamptz,
  ended_at timestamptz,
  ended_by_tenant_id integer,
  terminal_reason varchar(48),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_roommate_interests_request FOREIGN KEY (request_id)
    REFERENCES roommate_requests (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_roommate_interests_tenant CHECK (interested_tenant_id > 0),
  CONSTRAINT ck_roommate_interests_status CHECK (
    status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'LEFT')
  ),
  CONSTRAINT ck_roommate_interests_state_metadata CHECK (
    (status = 'PENDING' AND accepted_at IS NULL AND ended_at IS NULL AND terminal_reason IS NULL)
    OR (status = 'ACCEPTED' AND accepted_at IS NOT NULL AND ended_at IS NULL AND terminal_reason IS NULL)
    OR (
      status IN ('REJECTED', 'WITHDRAWN')
      AND accepted_at IS NULL
      AND ended_at IS NOT NULL
      AND terminal_reason IS NOT NULL
    )
    OR (
      status = 'LEFT'
      AND accepted_at IS NOT NULL
      AND ended_at IS NOT NULL
      AND ended_by_tenant_id IS NOT NULL
      AND terminal_reason IS NOT NULL
    )
  ),
  CONSTRAINT ck_roommate_interests_ended_by CHECK (
    ended_by_tenant_id IS NULL OR ended_by_tenant_id > 0
  ),
  CONSTRAINT ck_roommate_interests_reason CHECK (
    terminal_reason IS NULL OR char_length(terminal_reason) BETWEEN 1 AND 48
  ),
  CONSTRAINT ck_roommate_interests_reason_value CHECK (
    terminal_reason IS NULL OR terminal_reason IN (
      'USER_ACTION',
      'REQUEST_CANCELLED',
      'REQUEST_EXPIRED',
      'COMPETING_INTEREST_ACCEPTED',
      'PARTICIPANT_MATCHED_ELSEWHERE',
      'PARTICIPANT_BLOCKED',
      'MODERATION_ACTION'
    )
  ),
  CONSTRAINT ck_roommate_interests_timestamps CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX uq_roommate_interests_active_request_tenant
  ON roommate_interests (request_id, interested_tenant_id)
  WHERE status IN ('PENDING', 'ACCEPTED');

CREATE UNIQUE INDEX uq_roommate_interests_accepted_request
  ON roommate_interests (request_id)
  WHERE status = 'ACCEPTED';

CREATE UNIQUE INDEX uq_roommate_interests_accepted_tenant
  ON roommate_interests (interested_tenant_id)
  WHERE status = 'ACCEPTED';

CREATE INDEX idx_roommate_interests_request_status
  ON roommate_interests (request_id, status, created_at ASC, id ASC);

CREATE INDEX idx_roommate_interests_tenant_status
  ON roommate_interests (interested_tenant_id, status, created_at DESC, id DESC);

CREATE TABLE roommate_messages (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  interest_id integer NOT NULL,
  sender_tenant_id integer NOT NULL,
  body text NOT NULL,
  moderation_state varchar(16) NOT NULL DEFAULT 'VISIBLE',
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at timestamptz,
  CONSTRAINT fk_roommate_messages_interest FOREIGN KEY (interest_id)
    REFERENCES roommate_interests (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_roommate_messages_sender CHECK (sender_tenant_id > 0),
  CONSTRAINT ck_roommate_messages_body CHECK (
    body = btrim(body) AND char_length(body) BETWEEN 1 AND 2000
  ),
  CONSTRAINT ck_roommate_messages_moderation CHECK (moderation_state IN ('VISIBLE', 'HIDDEN'))
);

CREATE INDEX idx_roommate_messages_interest_created
  ON roommate_messages (interest_id, created_at ASC, id ASC);

ALTER TABLE contact_blocks
  ALTER COLUMN inquiry_id DROP NOT NULL;

ALTER TABLE contact_blocks
  ADD COLUMN roommate_request_id integer;

ALTER TABLE contact_blocks
  ADD CONSTRAINT fk_contact_blocks_roommate_request FOREIGN KEY (roommate_request_id)
    REFERENCES roommate_requests (id) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE contact_blocks
  ADD CONSTRAINT ck_contact_blocks_context CHECK (
    (inquiry_id IS NOT NULL AND roommate_request_id IS NULL)
    OR (inquiry_id IS NULL AND roommate_request_id IS NOT NULL)
  );

ALTER TABLE contact_reports
  ALTER COLUMN inquiry_id DROP NOT NULL;

ALTER TABLE contact_reports
  ADD COLUMN source varchar(24) NOT NULL DEFAULT 'CONTACT_INQUIRY';

ALTER TABLE contact_reports
  ADD COLUMN roommate_request_id integer;

ALTER TABLE contact_reports
  ADD COLUMN roommate_message_id integer;

ALTER TABLE contact_reports
  ADD COLUMN subject_tenant_id integer;

ALTER TABLE contact_reports
  ADD COLUMN target_type varchar(32);

ALTER TABLE contact_reports
  ADD CONSTRAINT fk_contact_reports_roommate_request FOREIGN KEY (roommate_request_id)
    REFERENCES roommate_requests (id) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE contact_reports
  ADD CONSTRAINT fk_contact_reports_roommate_message FOREIGN KEY (roommate_message_id)
    REFERENCES roommate_messages (id) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE contact_reports
  DROP CONSTRAINT ck_contact_reports_category;

ALTER TABLE contact_reports
  ADD CONSTRAINT ck_contact_reports_category CHECK (category IN (
    'SPAM',
    'FRAUD',
    'PAYMENT_SCAM',
    'HARASSMENT',
    'IMPERSONATION',
    'INAPPROPRIATE',
    'INAPPROPRIATE_CONTENT',
    'OTHER'
  ));

ALTER TABLE contact_reports
  ADD CONSTRAINT ck_contact_reports_source_context CHECK (
    (
      source = 'CONTACT_INQUIRY'
      AND inquiry_id IS NOT NULL
      AND roommate_request_id IS NULL
      AND roommate_message_id IS NULL
      AND subject_tenant_id IS NULL
      AND target_type IS NULL
    )
    OR (
      source = 'ROOMMATE'
      AND inquiry_id IS NULL
      AND roommate_request_id IS NOT NULL
      AND (
        (
          target_type = 'ROOMMATE_PROFILE'
          AND subject_tenant_id IS NOT NULL
          AND roommate_message_id IS NULL
        )
        OR (
          target_type = 'ROOMMATE_REQUEST'
          AND subject_tenant_id IS NULL
          AND roommate_message_id IS NULL
        )
        OR (
          target_type = 'ROOMMATE_MESSAGE'
          AND subject_tenant_id IS NULL
          AND roommate_message_id IS NOT NULL
        )
      )
    )
  );

ALTER TABLE contact_reports
  ADD CONSTRAINT ck_contact_reports_roommate_target_ids CHECK (
    (subject_tenant_id IS NULL OR subject_tenant_id > 0)
    AND (roommate_request_id IS NULL OR roommate_request_id > 0)
    AND (roommate_message_id IS NULL OR roommate_message_id > 0)
  );

CREATE UNIQUE INDEX uq_contact_reports_active_roommate_profile
  ON contact_reports (reporter_id, subject_tenant_id)
  WHERE source = 'ROOMMATE'
    AND target_type = 'ROOMMATE_PROFILE'
    AND status IN ('OPEN', 'INVESTIGATING');

CREATE UNIQUE INDEX uq_contact_reports_active_roommate_request
  ON contact_reports (reporter_id, roommate_request_id)
  WHERE source = 'ROOMMATE'
    AND target_type = 'ROOMMATE_REQUEST'
    AND status IN ('OPEN', 'INVESTIGATING');

CREATE UNIQUE INDEX uq_contact_reports_active_roommate_message
  ON contact_reports (reporter_id, roommate_message_id)
  WHERE source = 'ROOMMATE'
    AND target_type = 'ROOMMATE_MESSAGE'
    AND status IN ('OPEN', 'INVESTIGATING');

CREATE INDEX idx_contact_reports_source_status_created
  ON contact_reports (source, status, created_at DESC, id DESC);

CREATE INDEX idx_contact_reports_roommate_request
  ON contact_reports (roommate_request_id, created_at DESC, id DESC)
  WHERE roommate_request_id IS NOT NULL;

ALTER TABLE contact_report_events
  ADD COLUMN event_type varchar(32) NOT NULL DEFAULT 'STATUS';

ALTER TABLE contact_report_events
  ADD COLUMN subject_type varchar(32);

ALTER TABLE contact_report_events
  ADD COLUMN subject_id integer;

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
          AND new_status IN ('INVESTIGATING', 'DISMISSED')
        )
        OR (
          previous_status = 'INVESTIGATING'
          AND actor_role = 'ADMIN'
          AND new_status = 'RESOLVED'
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

ALTER TABLE notifications
  ADD COLUMN roommate_request_id integer;

ALTER TABLE notifications
  ADD COLUMN roommate_interest_id integer;

ALTER TABLE notifications
  ADD CONSTRAINT fk_notifications_roommate_request FOREIGN KEY (roommate_request_id)
    REFERENCES roommate_requests (id) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE notifications
  ADD CONSTRAINT fk_notifications_roommate_interest FOREIGN KEY (roommate_interest_id)
    REFERENCES roommate_interests (id) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE notifications
  DROP CONSTRAINT ck_notifications_event_type;

ALTER TABLE notifications
  ADD CONSTRAINT ck_notifications_event_type CHECK (
    event_type IN (
      'INQUIRY_CREATED',
      'MESSAGE_CREATED',
      'INQUIRY_STATUS_CHANGED',
      'LEAD_REMINDER_DUE',
      'LISTING_APPROVED',
      'LISTING_REJECTED',
      'LISTING_HIDDEN',
      'SAVED_SEARCH_MATCHED',
      'LISTING_AVAILABILITY_REMINDER',
      'ROOMMATE_INTEREST_RECEIVED',
      'ROOMMATE_INTEREST_ACCEPTED',
      'ROOMMATE_INTEREST_REJECTED',
      'ROOMMATE_INTEREST_WITHDRAWN',
      'ROOMMATE_MESSAGE_RECEIVED',
      'ROOMMATE_CONNECTION_LEFT',
      'ROOMMATE_REQUEST_EXPIRING',
      'ROOMMATE_REQUEST_EXPIRED'
    )
  );

ALTER TABLE notifications
  DROP CONSTRAINT ck_notifications_resource_reference;

ALTER TABLE notifications
  ADD CONSTRAINT ck_notifications_resource_reference CHECK (
    (
      event_type IN (
        'INQUIRY_CREATED',
        'MESSAGE_CREATED',
        'INQUIRY_STATUS_CHANGED',
        'LEAD_REMINDER_DUE'
      )
      AND inquiry_id IS NOT NULL
      AND listing_id IS NULL
      AND roommate_request_id IS NULL
      AND roommate_interest_id IS NULL
    )
    OR (
      event_type IN (
        'LISTING_APPROVED',
        'LISTING_REJECTED',
        'LISTING_HIDDEN',
        'SAVED_SEARCH_MATCHED',
        'LISTING_AVAILABILITY_REMINDER'
      )
      AND inquiry_id IS NULL
      AND listing_id IS NOT NULL
      AND roommate_request_id IS NULL
      AND roommate_interest_id IS NULL
    )
    OR (
      event_type IN (
        'ROOMMATE_INTEREST_RECEIVED',
        'ROOMMATE_INTEREST_ACCEPTED',
        'ROOMMATE_INTEREST_REJECTED',
        'ROOMMATE_INTEREST_WITHDRAWN',
        'ROOMMATE_MESSAGE_RECEIVED',
        'ROOMMATE_CONNECTION_LEFT'
      )
      AND inquiry_id IS NULL
      AND listing_id IS NULL
      AND roommate_request_id IS NULL
      AND roommate_interest_id IS NOT NULL
    )
    OR (
      event_type IN ('ROOMMATE_REQUEST_EXPIRING', 'ROOMMATE_REQUEST_EXPIRED')
      AND inquiry_id IS NULL
      AND listing_id IS NULL
      AND roommate_request_id IS NOT NULL
      AND roommate_interest_id IS NULL
    )
  );

ALTER TABLE notifications
  ADD CONSTRAINT ck_notifications_roommate_ids CHECK (
    (roommate_request_id IS NULL OR roommate_request_id > 0)
    AND (roommate_interest_id IS NULL OR roommate_interest_id > 0)
  );

CREATE INDEX idx_notifications_roommate_request
  ON notifications (roommate_request_id, created_at DESC, id DESC)
  WHERE roommate_request_id IS NOT NULL;

CREATE INDEX idx_notifications_roommate_interest
  ON notifications (roommate_interest_id, created_at DESC, id DESC)
  WHERE roommate_interest_id IS NOT NULL;
