#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${BACKUP_PASSPHRASE:?Export BACKUP_PASSPHRASE}"
archive=$(realpath -- "${1:?Usage: restore.sh ARCHIVE.enc}")
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root"
env_file=${HUB_RUNTIME_ENV_FILE:-.env.production}
compose=(docker compose --env-file "$env_file" -f docker-compose.prod.yml)
tmp=$(mktemp -d)
trap 'rm -rf -- "$tmp"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# Authenticate BEFORE decryption, archive parsing, Docker access or downtime.
python3 - "$archive" "$tmp/ciphertext" <<'PY'
import hashlib, hmac, os, sys
size = os.path.getsize(sys.argv[1])
if size < 80: raise SystemExit('Invalid backup')
with open(sys.argv[1], 'rb') as f:
    f.seek(-48, 2); salt, tag = f.read(16), f.read(32); f.seek(0)
    key = hashlib.pbkdf2_hmac('sha256', os.environ['BACKUP_PASSPHRASE'].encode(), b'Hublink backup MAC v1\0' + salt, 600000)
    mac = hmac.new(key, digestmod='sha256')
    with open(sys.argv[2], 'wb') as out:
        remaining = size - 48
        while remaining:
            chunk = f.read(min(remaining, 1024 * 1024))
            if not chunk: raise SystemExit('Truncated backup')
            mac.update(chunk); out.write(chunk); remaining -= len(chunk)
    if not hmac.compare_digest(mac.digest(), tag): raise SystemExit('Backup authentication failed')
PY
openssl enc -d -aes-256-cbc -md sha256 -pbkdf2 -iter 600000 -pass env:BACKUP_PASSPHRASE -in "$tmp/ciphertext" -out "$tmp/payload.tar.gz"
python3 - "$tmp" <<'PY'
import json, pathlib, sys, tarfile
root = pathlib.Path(sys.argv[1])
with tarfile.open(root / 'payload.tar.gz') as tar:
    members = tar.getmembers()
    if sorted(m.name for m in members) != ['SHA256SUMS', 'config.json', 'database.dump'] or any(not m.isfile() for m in members):
        raise SystemExit('Invalid backup members')
    tar.extractall(root, filter='data')
if json.loads((root / 'config.json').read_text()).get('version') != 1: raise SystemExit('Invalid config version')
PY
(cd "$tmp" && sha256sum --check --status SHA256SUMS)
project=$("${compose[@]}" config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["name"])')
[[ ${HUB_RESTORE_CONFIRM:-} == "$project" ]] || { echo "Set HUB_RESTORE_CONFIRM=$project to authorize replacement of this project" >&2; exit 1; }
exec 9>"/tmp/hublink-operation-${project}.lock"
flock -n 9 || { echo 'Another operation is active' >&2; exit 1; }
"${compose[@]}" run --rm --no-deps -T api node --input-type=module -e '
  import {parseConfig} from "./apps/api/dist/validators/index.js";
  import {readFileSync} from "node:fs";
  parseConfig(JSON.parse(readFileSync(0, "utf8")));
' < "$tmp/config.json"
"${compose[@]}" exec -T postgres pg_restore --list < "$tmp/database.dump" >/dev/null
# Save a recovery point while writes are stopped. Never resume service after failure.
"${compose[@]}" stop web api >/dev/null
"${compose[@]}" exec -T postgres sh -ec 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$tmp/previous.dump"
"${compose[@]}" run --rm --no-deps -T api node -e 'process.stdout.write(require("node:fs").readFileSync(process.env.HUB_CONFIG_PATH))' > "$tmp/previous.json"
restore_db() {
  "${compose[@]}" exec -T postgres sh -ec 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl --single-transaction --exit-on-error' < "$1"
}
restore_config() {
  "${compose[@]}" run --rm --no-deps -T api node -e '
    const fs=require("node:fs"), p=process.env.HUB_CONFIG_PATH;
    const data=fs.readFileSync(0); JSON.parse(data);
    fs.writeFileSync(p+".restore",data,{mode:0o600}); fs.renameSync(p+".restore",p);
  ' < "$1"
}
if ! restore_db "$tmp/database.dump"; then
  echo 'Database transaction rolled back; services remain stopped.' >&2; exit 1
fi
if ! restore_config "$tmp/config.json"; then
  restore_db "$tmp/previous.dump" && restore_config "$tmp/previous.json" || {
    echo 'Compensation failed. Services remain stopped; restore from your retained encrypted recovery backup.' >&2; exit 1;
  }
  echo 'Previous database/config restored; services remain stopped for inspection.' >&2; exit 1
fi
if ! "${compose[@]}" up -d --no-build --wait api web ||
   ! "${compose[@]}" exec -T web wget -qO- http://127.0.0.1/health; then
  "${compose[@]}" stop web api
  echo 'Health validation failed; services stopped. Use retained recovery backup.' >&2
  exit 1
fi
printf '\nRestore completed. Verify authentication, branding and vault with the original runtime master key.\n'
