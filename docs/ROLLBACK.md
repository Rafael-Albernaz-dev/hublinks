# Recovery and rollback

This playbook targets one isolated Compose project. Commands run from the repository root. Never use the development Compose file or remove database volumes during recovery. There are no DOWN migrations in this repository; reverting an image does not revert schema changes.

## Prepare before every release

1. Record the exact previous API/Web image tags and digests, PostgreSQL major version, environment-file location, project name and data directory. Retain those images; use immutable release tags rather than `local`.
2. Keep the runtime vault master key and database password in separately controlled offline custody. Database backups contain encrypted vault rows, not the master key. Losing that key makes restored credentials unreadable. Retain the old key for backups from that key version.
3. Export a strong `BACKUP_PASSPHRASE` through the operator's secret manager or a silent prompt (`read -rs BACKUP_PASSPHRASE; export BACKUP_PASSPHRASE`). Do not put it on the command line or enable shell tracing.
4. Set `HUB_RUNTIME_ENV_FILE` to the private environment file. Run `./scripts/backup.sh /secure/offline-backups`. Save its SHA-256 receipt separately, copy the encrypted archive off the host, and rehearse restore on a separate project with synthetic or appropriately controlled data.
5. Backups pause currently running API/Web services to keep configuration and database aligned, then resume only those services. Schedule this maintenance window. Only the scripts' own project is touched. Direct DB writers must also be paused.

## Roll back application images

1. Block traffic at the host TLS gateway and preserve SSH/console access.
2. Inspect the exact target with `docker compose --env-file "$HUB_RUNTIME_ENV_FILE" -f docker-compose.prod.yml ps`.
3. Stop that project's containers with `docker compose --env-file "$HUB_RUNTIME_ENV_FILE" -f docker-compose.prod.yml down`. Do **not** add `-v`.
4. Change `HUB_API_IMAGE` and `HUB_WEB_IMAGE` in the private environment file to the recorded previous release. Verify that those images support the current database schema. If compatibility is uncertain, restore the pre-release backup before bringing back the old API (do not let startup migrations run first).
5. Run `docker compose --env-file "$HUB_RUNTIME_ENV_FILE" -f docker-compose.prod.yml up -d --no-build --wait`. Review health, admin login, branding, audit events, and a controlled vault/extension journey before reopening traffic.

## Restore data

Prerequisites: Bash, Docker Compose, Python 3.12+, OpenSSL, GNU coreutils, `flock`, sufficient private temporary disk space, the original runtime master key, the backup passphrase, and a **retained encrypted recovery backup** of the current installation. Run as the authorized operator; never as an unattended public HTTP action.

1. Keep a known recovery point before replacing data. Record the exact Compose project name. Disable external writers and gateway traffic.
2. Export `HUB_RUNTIME_ENV_FILE`, `BACKUP_PASSPHRASE` and `HUB_RESTORE_CONFIRM` (the exact project name shown by Compose). Run `./scripts/restore.sh /secure/offline-backups/backup_TIMESTAMP.enc`.
3. The script authenticates the entire ciphertext with HMAC-SHA256 before decrypting it with AES-256-CBC/PBKDF2 (600,000 iterations). Encryption and MAC use independent salts/domain separation. It rejects unexpected archive members, non-regular files and checksum mismatches before downtime. Legacy unauthenticated `openssl enc` files are not accepted.
4. The script stops API/Web, saves a temporary recovery dump/config, restores PostgreSQL using `pg_restore --single-transaction --clean --if-exists --exit-on-error`, then atomically renames the configuration file. The snapshot must come from a trusted operator: PostgreSQL dumps contain executable database definitions.
5. If the DB restore fails, PostgreSQL rolls back. If replacing config fails, the script attempts to compensate with the previous DB/config. Failures leave services stopped for inspection. A process/host crash between DB commit and file rename cannot be atomic across both stores: recover from the retained encrypted recovery backup. Temporary plaintext files are removed on exit (deletion is not guaranteed secure erasure on SSDs).
6. Successful restore starts API/Web, waits for healthchecks and checks `/health` through Nginx. This is a liveness/initialization check, not an end-to-end vault proof. Verify login, branding, audit, revocation and vault readability with the original runtime key before restoring traffic. On health/start failure, stop API/Web and use the retained recovery backup; do not reopen traffic automatically.

## Connectivity loss or host failure

Use the VPS/hypervisor console or an existing SSH session. Check host firewall/TLS gateway, disk space, Docker status, Compose health and PostgreSQL logs without printing environment variables or credentials. Keep the database port private. If the host is lost, create an isolated replacement, load the previous images and protected runtime secrets, restore the encrypted backup, validate privately, then switch DNS/gateway traffic. Never expose the API or database directly as a workaround.

Retention, off-host storage, monitoring, restore frequency, TLS/domain, host capacity and key custody belong to the deployment operator. The tooling does not promise zero downtime, disaster recovery without keys, or unlimited tenants at zero cost.
