"""Cache only the native /plans HTML shell, preserving live proxy behavior."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess


def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout.strip()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def state():
    return {
        'application': run('docker', 'inspect', 'new-api', '--format', '{{.Id}} {{.State.StartedAt}} {{.RestartCount}}'),
        'nginx_master_pid': Path('/run/nginx.pid').read_text().strip(),
    }


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--expected-config', required=True)
args = parser.parse_args()
release = Path(__file__).resolve().parent.parent
commit = (release / 'source-commit.txt').read_text().strip()
assert re.fullmatch('[0-9a-f]{40}', commit)
assert re.fullmatch('[0-9a-f]{64}', args.expected_config)
assert run('hostname') == 'beiapi'
assert '179.255.125.53/32' in run('ip', '-4', '-o', 'address', 'show', 'dev', 'eth0')
site = Path('/etc/nginx/sites-available/beiapi.cn')
assert site.resolve() == site and digest(site) == args.expected_config, 'Live configuration changed'
text = site.read_text()
assert 'location = /plans {' not in text, 'Plans already has a dedicated location'
marker = '    location = / {\n'
assert text.count(marker) == 1
start = text.index(marker)
end = text.index('    location / {\n', start)
block = text[start:end]
assert block.rstrip().endswith('}')
assert 'proxy_pass http://capacity_backend_3000;' in block
assert 'public, max-age=300, stale-while-revalidate=86400, stale-if-error=86400' in block
# Both routes must be the same non-personalized app shell before sharing a TTL.
shells = [run('curl', '-fsS', '-H', 'Host: www.beiapi.cn', 'http://127.0.0.1:3000' + path) for path in ['/', '/plans']]
assert shells[0] == shells[1] and '<!doctype html' in shells[0].lower()
candidate = release / 'nginx-candidate.conf'
candidate.write_text(text[:start] + block.replace(marker, '    location = /plans {\n', 1) + text[start:])
backup = release / 'nginx-before.conf'
assert not backup.exists(), 'Release already applied'
before = state()
main = Path('/etc/nginx/nginx.conf').read_text()
include = 'include /etc/nginx/sites-enabled/*;'
assert main.count(include) == 1
enabled = list(Path('/etc/nginx/sites-enabled').iterdir())
assert sum(p.resolve() == site for p in enabled) == 1
includes = [f'include {p};' for p in sorted(enabled) if p.resolve() != site] + [f'include {candidate};']
test_config = release / 'nginx-test.conf'
test_config.write_text(main.replace(include, '\n'.join(includes)))
run('nginx', '-t', '-c', str(test_config))
shutil.copy2(site, backup)
os.chmod(backup, 0o600)
temporary = site.with_name(site.name + '.plans-cache.tmp')
try:
    assert digest(site) == args.expected_config and state() == before, 'Live state changed'
    shutil.copy2(site, temporary)
    temporary.write_bytes(candidate.read_bytes())
    os.replace(temporary, site)
    run('nginx', '-t')
    run('nginx', '-s', 'reload')
    assert state() == before, 'Unexpected application restart or Nginx master replacement'
except Exception:
    if digest(site) == digest(candidate):
        shutil.copy2(backup, temporary)
        os.replace(temporary, site)
        run('nginx', '-t')
        run('nginx', '-s', 'reload')
    raise
finally:
    temporary.unlink(missing_ok=True)
result = {
    'updated_at_utc': datetime.now(timezone.utc).isoformat(), 'source_commit': commit,
    'previous_config_sha256': args.expected_config, 'config_sha256': digest(site),
    'rollback_config': str(backup), 'release': str(release),
    'nginx_graceful_reload': True, 'application_restarted': False, **before,
}
(release / 'deployed.json').write_text(json.dumps(result, indent=2) + '\n')
Path('/opt/stacks/beiapi-homepage/last-plans-cache-rollout.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
