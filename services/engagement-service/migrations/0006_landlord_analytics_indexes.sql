CREATE INDEX idx_listing_inquiries_landlord_created_at
  ON listing_inquiries (landlord_id, created_at DESC, id DESC);

CREATE INDEX idx_inquiry_messages_inquiry_sender_created_at
  ON inquiry_messages (inquiry_id, sender_role, created_at ASC, id ASC);
