#!/usr/bin/env python3
"""Validate built Docker images using a disposable network/database and synthetic accounts."""
import argparse
import hashlib
import io
import json
import os
import pathlib
import secrets
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid
import zipfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--api-image', required=True)
    parser.add_argument('--web-image', required=True)
    parser.add_argument('--origin', required=True)
    parser.add_argument('--output', type=pathlib.Path)
    parser.add_argument('--source-root', type=pathlib.Path, default=pathlib.Path(__file__).resolve().parent.parent)
    args = parser.parse_args()
    os.umask(0o077)
    root = args.source_root.resolve()
    prefix = 'hublink-image-check-' + uuid.uuid4().hex[:10]
    network = prefix + '-net'
    names = []
    email = 'release-smoke@example.test'
    password = secrets.token_urlsafe(32)
    dbpass = secrets.token_hex(24)

    def run(*command):
        return subprocess.check_output(command, text=True).strip()

    def start(name, *arguments):
        run('docker', 'run', '-d', '--rm', '--name', name, '--network', network, *arguments)
        names.append(name)

    def request(base, path, method='GET', payload=None, cookie=None):
        headers = {'Content-Type': 'application/json'}
        if cookie:
            headers['Cookie'] = cookie
        req = urllib.request.Request(
            base + path,
            data=json.dumps(payload).encode() if payload is not None else None,
            headers=headers, method=method,
        )
        try:
            response = urllib.request.urlopen(req, timeout=10)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, response.headers, response.read()

    def no_store(headers, path):
        values = headers.get_all('Cache-Control', [])
        assert 'no-store' in ', '.join(values), (path, values)

    with tempfile.TemporaryDirectory(prefix=prefix + '-') as folder:
        envfile = pathlib.Path(folder) / 'synthetic.env'
        envfile.write_text('\n'.join([
            f'POSTGRES_PASSWORD={dbpass}', 'POSTGRES_USER=hublink', 'POSTGRES_DB=hublink_smoke',
            f'DATABASE_URL=postgres://hublink:{dbpass}@postgres:5432/hublink_smoke',
            f'VAULT_MASTER_KEY={secrets.token_hex(32)}', 'NODE_ENV=production',
            'HUB_API_HOST=0.0.0.0', f'HUB_CLIENT_ORIGINS={args.origin}',
            f'INITIAL_ADMIN_EMAIL={email}', f'INITIAL_ADMIN_PASSWORD={password}',
            'HUB_SEED_PILOT=false',
        ]) + '\n')
        try:
            run('docker', 'network', 'create', network)
            start(prefix + '-db', '--network-alias', 'postgres', '--env-file', str(envfile), 'postgres:16-alpine')
            for _ in range(100):
                ready = subprocess.run(
                    ['docker', 'exec', prefix + '-db', 'pg_isready', '-h', '127.0.0.1', '-U', 'hublink', '-d', 'hublink_smoke'],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                )
                if ready.returncode == 0:
                    break
                time.sleep(.3)
            else:
                raise RuntimeError('Isolated PostgreSQL did not start')
            start(prefix + '-api', '--network-alias', 'api', '--env-file', str(envfile), args.api_image)
            start(prefix + '-web', '-p', '127.0.0.1::80', args.web_image)
            mapping = run('docker', 'port', prefix + '-web', '80/tcp')
            assert mapping.startswith('127.0.0.1:')
            base = 'http://' + mapping
            for _ in range(100):
                try:
                    if request(base, '/health')[0] == 200:
                        break
                except (OSError, urllib.error.URLError):
                    pass
                time.sleep(.3)
            else:
                raise RuntimeError('Isolated application did not become healthy')
            paths = ['/api/config', '/api/catalog', '/api/vault/credentials', '/api/admin/users']
            for path in paths:
                status, headers, _ = request(base, path)
                assert status == 401, (path, status)
                no_store(headers, path)
            status, headers, data = request(base, '/api/auth/login', 'POST', {'email': email, 'password': password})
            assert status == 200, status
            no_store(headers, '/api/auth/login')
            assert set(json.loads(data)['user']) == {'id', 'displayName', 'email', 'role', 'active', 'avatar'}
            assert password.encode() not in data
            cookie = headers['Set-Cookie'].split(';')[0]
            assert all(flag in headers['Set-Cookie'] for flag in ['HttpOnly', 'SameSite=Lax', 'Secure'])
            for path in paths:
                status, headers, data = request(base, path, cookie=cookie)
                assert status == 200, (path, status)
                no_store(headers, path)
                for field in [b'password_hash', b'encrypted_password', b'encrypted_username', b'token_hash']:
                    assert field not in data
            status, headers, package = request(base, '/api/extension/package', cookie=cookie)
            assert status == 200
            no_store(headers, '/api/extension/package')
            with zipfile.ZipFile(io.BytesIO(package)) as archive:
                assert archive.testzip() is None
                manifest = json.loads(archive.read('manifest.json'))
                assert manifest['externally_connectable']['matches'] == [args.origin + '/*']
                assert manifest['content_scripts'][0]['matches'] == [args.origin + '/*']
                assert not any('localhost' in value or '127.0.0.1' in value for value in manifest['host_permissions'])
                package_files = sorted(archive.namelist())
            for path in ['favicon.svg', 'favicon.ico', 'favicon-32.png', 'apple-touch-icon.png']:
                source = root / 'apps/web/public' / path
                assert source.is_file(), path
                status, _, data = request(base, '/' + path)
                assert status == 200, path
                assert data == source.read_bytes(), path
            new_password = secrets.token_urlsafe(32)
            status, headers, _ = request(base, '/api/auth/profile', 'PUT', {'currentPassword': password, 'newPassword': new_password}, cookie)
            assert status == 200, status
            new_cookie = headers['Set-Cookie'].split(';')[0]
            assert new_cookie != cookie
            assert request(base, '/api/auth/me', cookie=cookie)[0] == 401
            assert request(base, '/api/auth/me', cookie=new_cookie)[0] == 200
            result = {
                'status': 'passed', 'scope': 'isolated Docker images, synthetic data, HTTP loopback',
                'apiImage': args.api_image, 'webImage': args.web_image,
                'apiUid': run('docker', 'exec', prefix + '-api', 'id', '-u'),
                'nodeVersion': run('docker', 'exec', prefix + '-api', 'node', '--version'),
                'nginxVersion': subprocess.check_output(['docker', 'exec', prefix + '-web', 'nginx', '-v'], text=True, stderr=subprocess.STDOUT).strip(),
                'extensionZipSha256': hashlib.sha256(package).hexdigest(),
                'extensionFiles': package_files, 'anonymousAccessDenied': True,
                'nginxPreservesNoStore': True, 'profileSessionRotation': True,
            }
            assert result['apiUid'] == '1000'
            if args.output:
                args.output.write_text(json.dumps(result, indent=2) + '\n')
            print(json.dumps(result, indent=2))
        finally:
            for name in reversed(names):
                subprocess.run(['docker', 'rm', '-f', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            subprocess.run(['docker', 'network', 'rm', network], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


if __name__ == '__main__':
    main()
