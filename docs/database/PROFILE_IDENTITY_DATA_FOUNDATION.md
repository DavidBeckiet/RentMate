# Profile Identity Data Foundation

This additive post-MVP foundation reserves an optional account display name in the Identity-owned `users` data. It does
not change registration, login, user-profile, admin, internal-service, or frontend contracts.

## Schema

Identity migration `0003_add_user_display_name.sql` and compatibility migration
`0013_add_user_display_name.sql` add the same column and constraint:

- `display_name varchar(120) NULL`;
- no default, unique constraint, index, or trigger;
- a non-null value must be nonblank and equal to `btrim(display_name)`.

Existing rows remain `NULL`. No migration or backfill derives a value from email, phone, role, placeholder text, or a
landlord verification submission. Account `display_name` is a self-asserted account label. The verification table's
`display_name` remains an independent submission snapshot and is not synchronized with the account column.

## Migration procedure

For a clean Identity database:

```powershell
npm.cmd --prefix services/identity-service run migrate -- clean --plan-only
npm.cmd --prefix services/identity-service run migrate -- clean
```

For an existing Identity database whose operator-owned record is `{ "appliedVersion": 2 }`:

```powershell
npm.cmd --prefix services/identity-service run migrate -- existing --manifest .\identity-version.json --plan-only
npm.cmd --prefix services/identity-service run migrate -- existing --manifest .\identity-version.json
```

The existing plan selects only `0003`. The runner never creates or updates a database bookkeeping table. The operator
updates the external record only after migration and verification succeed. Migration `0003` checks its `0002` schema
precondition and uses non-idempotent DDL so a version/schema mismatch fails instead of being hidden.

The compatibility database continues to use its established clean/existing migration commands. An existing manifest at
version `12` selects only `0013`. Both database changes are forward-only; rollback uses a compatible application artifact
and leaves the nullable column in place.
