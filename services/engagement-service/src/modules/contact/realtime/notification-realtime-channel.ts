export const notificationRealtimeChannel = "rentmate_notification_created";

// PostgreSQL delivers NOTIFY payloads after the surrounding transaction commits.
// Keeping the payload limited to the public notification projection avoids a
// second database read in the long-lived event-stream request.
export const notificationRealtimeNotifyExpression = `
  pg_notify(
    '${notificationRealtimeChannel}',
    json_build_object(
      'recipientId', recipient_id,
      'notification', json_build_object(
        'id', id,
        'eventType', event_type,
        'inquiryId', inquiry_id,
        'listingId', listing_id,
        'roommateRequestId', roommate_request_id,
        'roommateInterestId', roommate_interest_id,
        'resourcePath', resource_path,
        'isRead', is_read,
        'createdAt', created_at
      )
    )::text
  ) AS notification_realtime_event`;
