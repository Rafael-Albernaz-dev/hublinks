#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${BACKUP_PASSPHRASE:?Export BACKUP_PASSPHRASE (at least 16 characters)}"
[[ ${#BACKUP_PASSPHRASE} -ge 16 ]] || { echo 'Passphrase too short' >&2; exit 1; }
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root"
env_file=${HUB_RUNTIME_ENV_FILE:-.env.production}
compose=(docker compose --env-file "$env_file" -f docker-compose.prod.yml)
out=${1:?Usage: backup.sh OUTPUT_DIRECTORY}
mkdir -p -- "$out"
out=$(cd -- "$out" && pwd)
tmp=$(mktemp -d)
running=()
staged=''
cleanup() {
  status=$?
  rm -rf -- "$tmp"
  if [[ -n $staged ]]; then rm -f -- "$staged"; fi
  if ((${#running[@]})); then "${compose[@]}" start "${running[@]}" >/dev/null || status=1; fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# Do not race another backup/restore for this project.
project=$("${compose[@]}" config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["name"])')
exec 9>"/tmp/hublink-operation-${project}.lock"
flock -n 9 || { echo 'Another operation is active' >&2; exit 1; }
mapfile -t running < <("${compose[@]}" ps --status running --services | sed -n '/^api$/p; /^web$/p')
if ((${#running[@]})); then "${compose[@]}" stop "${running[@]}" >/dev/null; fi
"${compose[@]}" exec -T postgres sh -ec 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$tmp/database.dump"
# A one-off API container reads the exact same bind-mounted config even when stopped.
"${compose[@]}" run --rm --no-deps -T api node -e 'process.stdout.write(require("node:fs").readFileSync(process.env.HUB_CONFIG_PATH))' > "$tmp/config.json"
python3 -c 'import json,sys; assert json.load(open(sys.argv[1]))["version"] == 1' "$tmp/config.json"
(cd "$tmp" && sha256sum database.dump config.json > SHA256SUMS)
tar -czf "$tmp/payload.tar.gz" -C "$tmp" database.dump config.json SHA256SUMS
openssl enc -aes-256-cbc -md sha256 -pbkdf2 -iter 600000 -salt -pass env:BACKUP_PASSPHRASE -in "$tmp/payload.tar.gz" -out "$tmp/archive.enc"
# Encrypt-then-MAC: independent PBKDF2 domain/salt, 16-byte salt + 32-byte tag trailer.
python3 - "$tmp/archive.enc" <<'PY'
import hashlib, hmac, os, sys
p = sys.argv[1]
salt = os.urandom(16)
key = hashlib.pbkdf2_hmac('sha256', os.environ['BACKUP_PASSPHRASE'].encode(), b'Hublink backup MAC v1\0' + salt, 600000)
mac = hmac.new(key, digestmod='sha256')
with open(p, 'rb') as f:
    for chunk in iter(lambda: f.read(1024 * 1024), b''): mac.update(chunk)
with open(p, 'ab') as f: f.write(salt + mac.digest())
PY
file="$out/backup_$(date -u +%Y%m%dT%H%M%SZ)_${RANDOM}.enc"
# No partial archive appears under the final name.
staged=$(mktemp "$out/.backup-${project}.XXXXXX")
cp -- "$tmp/archive.enc" "$staged"
ln -- "$staged" "$file"
rm -- "$staged"
staged=''
sha256sum "$file"
