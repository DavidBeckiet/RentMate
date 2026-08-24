# Profile Identity API

This additive post-MVP contract is owned by Identity Service. The legacy compatibility backend is outside active Profile
Identity scope and is not required to expose or persist `displayName`.

## External contract

Identity tenant and landlord registration accept optional `displayName?: string`. Omission remains valid for older
clients and stores `NULL`; an explicitly supplied `null` is invalid. Identity registration, login,
`GET /api/v1/users/me`, `PATCH /api/v1/users/me`, and admin user responses that use the canonical profile include:

```text
displayName: string | null
```

Legacy Identity accounts return `displayName: null`. Email remains immutable and is the only login identifier.

`PATCH /api/v1/users/me` accepts any subset of:

```ts
{
  displayName?: string;
  phone?: string | null;
}
```

Omitted fields are unchanged. An empty object is a read-only no-op. Unknown and protected fields remain invalid, and
the existing role-specific phone rules are unchanged.

## Display-name normalization

When supplied, `displayName` must be a JSON string. Identity Service normalizes it to NFC, trims outer whitespace,
rejects a blank result and Unicode control characters, and limits the normalized result to 120 Unicode code points. It
does not lowercase, title-case, transliterate, or alter internal whitespace.

A normalized value equal to the stored value is a no-op. The profile repository conditionally updates display name and
phone in one statement and advances `updatedAt` only when at least one canonical value changes.

## Ownership and boundaries

Account `displayName` is a mutable self-asserted UX label owned by Identity Service. It is not a username or verified
identity and is never synchronized with `landlord_verifications.display_name`; the latter remains an independent
verification-submission snapshot.

The field is not propagated through internal profile contracts to Listing Service or Engagement Service. It is also not
duplicated into their databases. Any such propagation requires a separate explicitly scoped contract change.
