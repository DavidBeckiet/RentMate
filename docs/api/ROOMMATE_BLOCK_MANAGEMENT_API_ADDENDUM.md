# Roommate block management API addendum

Status: approved post-release functional extension to Roommate V1. This addendum does not rewrite the released `ROOMMATE_V1_SPECIFICATION.md` or create a new Roommate V1 milestone.

## Why this endpoint exists

Roommate already supports pair block and context-scoped unblock. A caller-owned block hides the related request, interest, and conversation from ordinary Roommate surfaces, so a tenant previously had no durable way to find a block they created and intentionally remove it.

## Endpoint

`GET /api/v1/roommate-blocks/mine?page=&pageSize=`

The endpoint requires an authenticated active tenant. Anonymous and inactive callers receive `401`; another role receives `403`.

It returns a limit-plus-one paginated collection of only rows where:

- `contact_blocks.blocker_id` is the authenticated tenant; and
- `contact_blocks.roommate_request_id` is not null.

Each item contains:

```json
{
  "blockedAt": "2026-08-27T12:00:00.000Z",
  "counterpart": {
    "displayName": "Minh",
    "memberSince": "2026-01"
  },
  "unblockAction": {
    "kind": "REQUEST",
    "id": 123
  }
}
```

`unblockAction` is opaque action context for an existing endpoint:

- `REQUEST` uses `DELETE /api/v1/roommate-requests/:requestId/block`.
- `INTEREST` uses `DELETE /api/v1/roommate-interests/:interestId/block`.

No new delete endpoint is introduced.

## Privacy and lifecycle rules

The response never exposes tenant IDs, `blocker_id`, `blocked_id`, email, phone, exact location, moderation data, terminal reasons, contact content, or reverse-direction blocks. Counterpart presentation is batch-loaded through the existing public-safe Identity roommate projection.

The collection only establishes that the caller owns the listed block. It does not disclose whether the counterpart has blocked the caller.

Unblocking retains its existing idempotent behavior. It only removes the caller-owned block record. It does not restore an old interest, connection, or matched request, and it creates no notification. Any future interaction must start through a new valid Roommate workflow.

## Data impact

No schema migration is required. The endpoint reads the existing `contact_blocks` Roommate context and uses the existing request/interest unblock endpoints.
