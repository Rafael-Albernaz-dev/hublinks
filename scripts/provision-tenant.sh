#!/usr/bin/env bash
# Standby only: generates a private installation; does not start containers or modify a server.
set -euo pipefail
umask 077
slug=${1:?Usage: provision-tenant.sh SLUG COMPANY_NAME ADMIN_EMAIL}
company=${2:?Company name required}
email=${3:?Admin email required}
[[ $slug =~ ^[a-z][a-z0-9_]{1,30}$ ]] || { echo 'Use a lowercase slug (2–31 letters/digits/underscores)' >&2; exit 1; }
[[ $email =~ ^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+$ ]] || { echo 'Invalid admin email' >&2; exit 1; }
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root"
tenant="$root/data/tenants/$slug"
mkdir -p "$root/data/tenants"
mkdir -- "$tenant" # Fail closed if it already exists; never overwrite keys.
trap 'echo "Generation failed; inspect the private tenant directory before retrying." >&2' ERR
mkdir "$tenant/data"
python3 - "$tenant" "$slug" "$company" "$email" <<'PY'
import json, pathlib, secrets, sys
path, slug, company, email = pathlib.Path(sys.argv[1]), *sys.argv[2:]
values = {
    'HUB_PROJECT_NAME': f'hublink-{slug.replace("_", "-")}',
    'POSTGRES_DB': f'hublink_{slug}',
    'POSTGRES_PASSWORD': secrets.token_hex(32),
    'VAULT_MASTER_KEY': secrets.token_hex(32),
    'INITIAL_ADMIN_EMAIL': email,
    'INITIAL_ADMIN_PASSWORD': secrets.token_urlsafe(32),
    'HUB_CLIENT_ORIGINS': 'https://replace-before-start.example.invalid',
    'HUB_WEB_PORT': '8080',
    'HUB_API_IMAGE': f'hublink-api:{slug}',
    'HUB_WEB_IMAGE': f'hublink-web:{slug}',
    'HUB_DATA_DIR': str(path / 'data'),
    'HUB_RUNTIME_ENV_FILE': str(path / '.env.production'),
}
(path / '.env.production').write_text(''.join(f'{k}={v}\n' for k,v in values.items()))
(path / '.env.production').chmod(0o600)
(path / 'data/config.json').write_text(json.dumps({'version': 1, 'companyName': company, 'subtitle': 'Seus acessos organizados em um só lugar.', 'color': {'r': 113, 'g': 55, 'b': 209}, 'logoDataUrl': None, 'links': []}, indent=2) + '\n')
(path / 'data/config.json').chmod(0o600)
PY
python3 - "$root" "$tenant" <<'PYCODE'
import pathlib, sys
root, tenant = map(pathlib.Path, sys.argv[1:])
text = (root / 'docker-compose.prod.yml').read_text().replace('context: .', 'context: ' + str(root))
(tenant / 'compose.yml').write_text(text)
PYCODE
printf 'Generated private tenant files under %s\n' "$tenant"
printf 'Standby: no database or containers created. Before startup: review origin/TLS, select an unused port, grant UID 1000 ownership of the data directory, and retain secrets securely.\n'
printf 'Use the root Compose file with HUB_RUNTIME_ENV_FILE pointing to this tenant environment and --env-file set to the same file.\n'
