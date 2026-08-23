# Inquiry Realtime Architecture

## Current flow

```text
Tenant or landlord browser
  |-- POST message / PATCH status (existing REST API)
  `-- GET inquiry events (SSE, session cookie)
             |
        API Gateway
             |
      Engagement Service
        |-- PostgreSQL transaction
        `-- in-memory inquiry event hub
```

The Engagement Service owns inquiry authorization, persistence, and realtime publication. A message or status event is published only after its REST transaction completes. The API Gateway streams the response without applying its ordinary post-header inactivity timeout. The frontend uses native `EventSource` with credentials, shows a textual connection state, reconnects automatically, merges messages by ID, and reloads the canonical inquiry to recover missed events and read-state changes.

## Security and lifecycle

- The stream uses the existing host-only HttpOnly session cookie; no token is placed in JavaScript or the URL.
- Engagement verifies the current active account and inquiry participation before sending stream headers.
- Connections expire after 45 seconds, causing periodic reauthentication during long-open conversations.
- Closing the browser connection removes its subscription and timers.
- A subscriber failure cannot make an already-committed REST request fail.

## Scaling boundary

The event hub is intentionally process-local and requires exactly one active Engagement instance for complete delivery. PostgreSQL remains canonical, so reconnect synchronization preserves correctness, but separate Engagement replicas would not share immediate events.

Before horizontally scaling Engagement, replace the process-local fan-out with an approved shared broker such as Redis Pub/Sub or a durable message bus. That expansion must define cross-instance delivery, failure recovery, observability, and deployment ownership; it is not part of the current implementation.
