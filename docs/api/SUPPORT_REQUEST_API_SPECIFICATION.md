# Support Requests API Contract

Support Requests are one-way support/contact records. They do not provide chat, requester-facing replies, notifications, attachments, assignment, internal-note history, priority, SLA, or reopen behavior.

## Lifecycle

```text
OPEN → IN_PROGRESS → RESOLVED
OPEN → RESOLVED
```

`IN_PROGRESS` means an administrator has started reviewing the request. It does not assign or reserve the request to that administrator, and it does not persist a note.

`RESOLVED` is an internal support outcome. It does not mean that RentMate replied to the requester in the application or that the requester confirmed resolution.

## Endpoints

### POST `/api/v1/support-requests`

- **Authentication:** Active authenticated user.
- **Body:** `category` (`ACCOUNT`, `LISTING`, `SAFETY`, `TECHNICAL`, or `OTHER`), `subject` (non-blank, up to 160 characters), and `message` (non-blank, up to 4,000 characters).
- **Success:** `201` with request `id`, `status: "OPEN"`, and `createdAt`.
- **Rate limit:** Three creates per hour per requester/IP.

### GET `/api/v1/admin/support-requests`

- **Authentication/role:** Active `ADMIN`.
- **Query:** `status` (`OPEN` by default), `page`, and `pageSize` (maximum 100).
- **Ordering:** `createdAt DESC`, then `id DESC`.
- **Success:** Paginated admin support-request records.

### GET `/api/v1/admin/support-requests/:supportRequestId`

- **Authentication/role:** Active `ADMIN`.
- **Path:** Positive support-request ID.
- **Success:** `200` with the authoritative current admin support-request record, containing `id`, requester `id`/`role`/`email`/`isActive`, `category`, `subject`, `message`, `status`, `resolutionNote`, `assignedAdminId`, `createdAt`, `updatedAt`, and `resolvedAt`.
- **Errors:** `401` for missing or invalid authentication, `403` for an authenticated non-admin, `404` for an unknown valid ID, and `422` for an invalid ID.
- **Privacy:** The record omits requester phone, display name, verification data, related entities, attachments, messages, and history because they are not part of this contract.

### PATCH `/api/v1/admin/support-requests/:supportRequestId/status`

- **Authentication/role:** Active `ADMIN`.
- **Body:** `status` (`IN_PROGRESS` or `RESOLVED`) and optional `note`.
- **Transition rules:** The only accepted targets are `IN_PROGRESS` and `RESOLVED`. Valid state transitions are `OPEN → IN_PROGRESS`, `OPEN → RESOLVED`, and `IN_PROGRESS → RESOLVED`; an accepted target that is invalid from the current state returns `409`. Invalid target values return `422`.
- **Resolution:** `RESOLVED` requires a non-blank note of at most 2,000 characters, records the resolving admin ID, and records `resolvedAt`.
- **In progress:** `IN_PROGRESS` stores neither a resolution note nor an assigned admin ID.
- **Concurrency:** The transition locks the current row. It does not retry mutations automatically; clients can use GET-by-ID to retrieve canonical state after a `409` or uncertain request outcome.
