# Inquiry Realtime API Specification

This additive post-MVP contract streams inquiry changes to the tenant and landlord who participate in that inquiry. Sending messages and changing inquiry status continue to use the existing REST endpoints; the stream is receive-only.

## Endpoint

`GET /api/v1/inquiries/:inquiryId/events`

- Requires the normal `rentmate_session` HttpOnly cookie.
- Only the inquiry's tenant or landlord may connect.
- A missing inquiry or a non-participant receives `404` to avoid disclosing its existence.
- Missing, invalid, expired, or inactive authentication receives `401`.
- The response content type is `text/event-stream` and must not be buffered by the gateway or reverse proxy.
- The server advertises a two-second reconnect delay, sends a heartbeat every five seconds, and closes each connection after 45 seconds so the browser reconnects and authorization is checked again.

## Events

Each event is sent in the SSE `data` field as JSON.

```json
{ "type": "CONNECTED", "inquiryId": 7 }
```

```json
{
  "type": "MESSAGE_CREATED",
  "inquiryId": 7,
  "message": {
    "id": 15,
    "senderRole": "TENANT",
    "body": "Tôi có thể xem phòng lúc 18 giờ không?",
    "isRead": false,
    "createdAt": "2026-08-24T11:00:00.000Z"
  }
}
```

```json
{
  "type": "STATUS_CHANGED",
  "inquiryId": 7,
  "status": "CLOSED",
  "updatedAt": "2026-08-24T11:05:00.000Z"
}
```

Events contain no tenant ID, landlord ID, email, phone, cookie, token, internal service value, or provider value. A client ignores malformed events and events for a different inquiry.

## Delivery and recovery

The database remains the source of truth. Events are published only after the related database transaction succeeds. Delivery is best-effort and may be duplicated or missed during disconnects, so the frontend deduplicates messages by ID and reloads the authorized inquiry after connecting or receiving a message from the other participant.

This contract does not provide typing indicators, online presence, read receipts, or message editing/deletion.
