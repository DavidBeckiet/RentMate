# RentMate database disaster-recovery runbook

## Local rehearsal boundary

The repository scripts operate only through the `postgres` service in `docker-compose.microservices.yml`. They back up
the active Identity, Listing, and Engagement databases. The retained compatibility backend and its legacy database are
outside this operational scope. Restore rehearsal creates randomly named databases
with the mandatory `rentmate_restore_check_` prefix, verifies public tables, and drops only those disposable databases.

These scripts are local evidence. They are not a production backup schedule, off-site retention system, or PostgreSQL
point-in-time recovery implementation.

## Create a local backup set

```powershell
npm.cmd run backup:local
```

The command creates `artifacts/backups/<UTC timestamp>/` with three custom-format dumps and a manifest containing size
and SHA-256 checksums. `artifacts/` is ignored by Git. Treat these files as sensitive because they contain application
data; never attach them to an issue or commit them.

## Rehearse restore

Restore the newest local set:

```powershell
npm.cmd run restore:rehearsal
```

Or select an exact manifest:

```powershell
npm.cmd run restore:rehearsal -- --manifest artifacts/backups/<timestamp>/manifest.json
```

Success requires checksum verification, `pg_restore --exit-on-error`, at least one public table in every restored
database, and cleanup of each disposable database. A failure keeps the source databases unchanged.

## Production requirements not satisfied by the local scripts

- encrypted automated backups stored outside the application environment;
- continuous WAL archiving and point-in-time recovery where the approved RPO requires it;
- retention and deletion policy;
- monitoring for missed backups and archive lag;
- named backup, restore, security, and approval owners;
- restore into a new replacement environment followed by application and data-consistency verification;
- documented RPO/RTO and a timed restore exercise.

Never restore over the source production database. Restore into a new target, verify it, and switch deliberately under
an approved incident or release plan.
