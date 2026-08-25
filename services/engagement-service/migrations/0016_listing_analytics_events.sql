CREATE TABLE listing_analytics_events (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_id integer NOT NULL,
  landlord_id integer NOT NULL,
  actor_id integer,
  event_type varchar(24) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_listing_analytics_events_ids CHECK (
    listing_id > 0 AND landlord_id > 0 AND (actor_id IS NULL OR actor_id > 0)
  ),
  CONSTRAINT ck_listing_analytics_events_type CHECK (
    event_type IN ('VIEW', 'FAVORITE', 'CALL_CLICK', 'EMAIL_CLICK')
  )
);

CREATE INDEX idx_listing_analytics_events_landlord_created
  ON listing_analytics_events (landlord_id, created_at DESC, id DESC);

CREATE INDEX idx_listing_analytics_events_listing_type_created
  ON listing_analytics_events (listing_id, event_type, created_at DESC, id DESC);
