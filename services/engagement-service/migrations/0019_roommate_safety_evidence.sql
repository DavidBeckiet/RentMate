ALTER TABLE contact_reports
  ADD COLUMN evidence_snapshot jsonb;

ALTER TABLE contact_reports
  ADD CONSTRAINT ck_contact_reports_evidence_snapshot CHECK (
    (
      source = 'CONTACT_INQUIRY'
      AND evidence_snapshot IS NULL
    )
    OR (
      source = 'ROOMMATE'
      AND evidence_snapshot IS NOT NULL
      AND jsonb_typeof(evidence_snapshot) = 'object'
    )
  );
