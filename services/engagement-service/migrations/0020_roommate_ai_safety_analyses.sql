CREATE TABLE roommate_message_ai_safety_analyses (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  message_id integer NOT NULL,
  analysis_version varchar(64) NOT NULL,
  prompt_version varchar(64) NOT NULL,
  schema_version varchar(64) NOT NULL,
  provider varchar(32) NOT NULL,
  model_identifier varchar(160) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'PENDING',
  attempt_count smallint NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lease_expires_at timestamptz,
  outcome varchar(16),
  signal_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  evidence_message_ids integer[] NOT NULL DEFAULT ARRAY[]::integer[],
  last_error_code varchar(40),
  analyzed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_roommate_message_ai_safety_analyses_message FOREIGN KEY (message_id)
    REFERENCES roommate_messages (id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT uq_roommate_message_ai_safety_analyses_version UNIQUE (message_id, analysis_version),
  CONSTRAINT ck_roommate_message_ai_safety_analyses_status CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  CONSTRAINT ck_roommate_message_ai_safety_analyses_attempt_count CHECK (attempt_count BETWEEN 0 AND 2),
  CONSTRAINT ck_roommate_message_ai_safety_analyses_outcome CHECK (outcome IS NULL OR outcome IN ('NO_WARNING', 'CAUTION', 'HIGH_CAUTION')),
  CONSTRAINT ck_roommate_message_ai_safety_analyses_signal_codes CHECK (
    cardinality(signal_codes) <= 7
    AND signal_codes <@ ARRAY[
      'ADVANCE_PAYMENT_REQUEST', 'OTP_REQUEST', 'CREDENTIAL_REQUEST', 'OFF_PLATFORM_REDIRECTION',
      'EXTERNAL_PAYMENT_REQUEST', 'URGENCY_PRESSURE', 'SENSITIVE_FINANCIAL_INFO_REQUEST'
    ]::text[]
  ),
  CONSTRAINT ck_roommate_message_ai_safety_analyses_evidence_message_ids CHECK (cardinality(evidence_message_ids) <= 6),
  CONSTRAINT ck_roommate_message_ai_safety_analyses_lease CHECK (
    (status = 'PROCESSING' AND lease_expires_at IS NOT NULL)
    OR (status IN ('PENDING', 'COMPLETED', 'FAILED') AND lease_expires_at IS NULL)
  ),
  CONSTRAINT ck_roommate_message_ai_safety_analyses_completion CHECK (
    (status = 'COMPLETED' AND outcome IS NOT NULL AND analyzed_at IS NOT NULL AND lease_expires_at IS NULL AND last_error_code IS NULL)
    OR (status = 'FAILED' AND outcome IS NULL AND analyzed_at IS NULL AND lease_expires_at IS NULL AND last_error_code IS NOT NULL)
    OR (status IN ('PENDING', 'PROCESSING') AND outcome IS NULL AND analyzed_at IS NULL)
  )
);

CREATE INDEX idx_roommate_message_ai_safety_analyses_claim
  ON roommate_message_ai_safety_analyses (status, next_attempt_at, lease_expires_at, id);

CREATE INDEX idx_roommate_message_ai_safety_analyses_retention
  ON roommate_message_ai_safety_analyses (analyzed_at, updated_at, id)
  WHERE status IN ('COMPLETED', 'FAILED');

CREATE INDEX idx_roommate_messages_ai_safety_scan
  ON roommate_messages (created_at ASC, id ASC);
