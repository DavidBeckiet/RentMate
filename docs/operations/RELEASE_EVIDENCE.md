# RentMate active release evidence

## Purpose

Every active CI release gate creates a small, non-secret evidence bundle that ties one immutable source revision to the
inputs used by the active microservice topology. It supports release review, incident comparison, and application
rollback decisions; it is not a container signature or a replacement for registry provenance.

The bundle contains:

- release version and exact 40- or 64-character Git revision;
- Node and package-manager versions;
- immutable local image IDs, release tags, and verified OCI version/revision/vendor labels for the five application
  images built by the same CI job;
- SHA-256 and byte size for active package manifests, lockfiles, Dockerfiles, Compose topology, and database bootstrap;
- the ordered Identity, Listing, and Engagement migration inventories with a SHA-256 for every SQL file;
- a SHA-256 sidecar for the manifest itself.

The retained `backend/` compatibility tree is deliberately excluded.

Production configuration validation requires `RENTMATE_IMAGE_TAG` to exactly match `RENTMATE_RELEASE_VERSION` and
requires `RENTMATE_SOURCE_REVISION` to be an exact Git revision before deployment proceeds.

## Generate locally

First build all five Compose application images with `RENTMATE_IMAGE_TAG` equal to the release label and with matching
`RENTMATE_RELEASE_VERSION` and `RENTMATE_SOURCE_REVISION` build arguments. Then use a clean Git checkout, its exact
immutable revision, and a release label containing only letters, digits, periods, underscores, and hyphens. Generation
fails if an image is absent, an OCI label differs, the revision differs from `HEAD`, or the working tree has changes:

```powershell
$env:RENTMATE_RELEASE_VERSION = "2026.09.27-abcdef"
$env:RENTMATE_IMAGE_TAG = $env:RENTMATE_RELEASE_VERSION
$env:RENTMATE_SOURCE_REVISION = "<exact-40-or-64-character-git-revision>"
docker compose -f docker-compose.microservices.yml build identity listing engagement verification-delivery gateway
npm.cmd run release:evidence
```

Output is written once to `artifacts/release-evidence/<release-version>/`. Generation fails instead of overwriting an
existing evidence directory. The `artifacts/` tree is Git-ignored.

## Review and retention

CI uploads the evidence directory as a 30-day workflow artifact. Before approving a release or rollback:

1. Verify `release-manifest.sha256` against `release-manifest.json`.
2. Confirm `sourceRevision` is the reviewed revision.
3. Confirm all expected active image IDs/OCI labels and all three migration inventories are present.
4. Compare migration hashes with the deployed release before deciding whether application-only rollback is safe.
5. Retain approved production evidence according to the organization's release and incident policy.

The manifest proves what the repository gate inventoried. Production-grade supply-chain assurance still requires an
approved registry, immutable image digests, artifact signing/attestation, protected deployment environments, and
retention outside ephemeral CI storage.
