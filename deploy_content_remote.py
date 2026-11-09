"""Atomically update only the public homepage from an extracted git archive."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess


def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout.strip()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def runtime_state():
    return {
        'newapi_container': run('docker', 'inspect', 'new-api', '--format', '{{.Id}} {{.RestartCount}}'),
        'nginx_master_pid': Path('/run/nginx.pid').read_text().strip(),
        'nginx_config_sha256': digest(Path('/etc/nginx/sites-available/beiapi.cn')),
    }


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--expected-before', required=True)
parser.add_argument('--expected-nav-before')
args = parser.parse_args()
source = Path(__file__).resolve().parent
release = source.parent
commit = (release / 'source-commit.txt').read_text().strip()
assert re.fullmatch(r'[0-9a-f]{40}', commit), 'Invalid source commit'
assert re.fullmatch(r'[0-9a-f]{64}', args.expected_before), 'Invalid baseline checksum'
assert run('hostname') == 'beiapi', 'Wrong host'
assert '179.255.125.53/32' in run('ip', '-4', '-o', 'address', 'show', 'dev', 'eth0'), 'Wrong address'
target = Path('/usr/share/nginx/html/beiapi-home/index.html')
assert target.resolve() == target and target.is_file(), 'Unexpected homepage target'
assert digest(target) == args.expected_before, 'Live homepage changed; review before replacing'
candidate = source / 'public' / 'index.html'
candidate_sha = digest(candidate)
assert candidate_sha != args.expected_before, 'No content update'
updates = [(target, candidate, args.expected_before, release / 'index-before.html')]
if args.expected_nav_before:
    assert re.fullmatch(r'[0-9a-f]{64}', args.expected_nav_before), 'Invalid brand script checksum'
    nav = Path('/usr/share/nginx/html/beiapi-assets/nav-plans.js')
    assert nav.resolve() == nav and nav.is_file(), 'Unexpected brand script target'
    assert digest(nav) == args.expected_nav_before, 'Live brand script changed; review before replacing'
    updates.insert(0, (nav, source / 'beiapi-assets' / 'nav-plans.js', args.expected_nav_before, release / 'nav-plans-before.js'))
for asset in (source / 'public' / 'assets').rglob('*'):
    if asset.is_file():
        live_asset = target.parent / 'assets' / asset.relative_to(source / 'public' / 'assets')
        assert live_asset.is_file() and digest(live_asset) == digest(asset), 'Live assets differ'
run('nginx', '-t')
before = runtime_state()
backup = release / 'index-before.html'
for live, incoming, expected, previous in updates:
    assert not previous.exists(), 'Release already applied'
    shutil.copy2(live, previous)
(release / 'state-before.json').write_text(json.dumps(before, indent=2) + '\n')
rollout = Path('/opt/stacks/beiapi-homepage/last-rollout.json')
if rollout.exists():
    shutil.copy2(rollout, release / 'last-rollout-before.json')
staged = []
installed = []
try:
    for live, incoming, expected, previous in updates:
        live_stat = live.stat()
        temporary = live.with_name(live.name + '.' + commit[:12] + '.tmp')
        with temporary.open('xb') as stream:
            stream.write(incoming.read_bytes())
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, stat.S_IMODE(live_stat.st_mode))
        os.chown(temporary, live_stat.st_uid, live_stat.st_gid)
        staged.append((live, temporary, expected, previous, digest(incoming)))
    assert all(digest(live) == expected for live, temporary, expected, previous, new_sha in staged), 'Live content changed during staging'
    for live, temporary, expected, previous, new_sha in staged:
        os.replace(temporary, live)
        installed.append((live, previous, new_sha))
        assert digest(live) == new_sha, 'Installed checksum mismatch'
    assert runtime_state() == before, 'Runtime or Nginx changed during content deployment'
except Exception:
    for live, previous, new_sha in reversed(installed):
        if digest(live) == new_sha:
            rollback = live.with_name(live.name + '.' + commit[:12] + '.rollback')
            shutil.copy2(previous, rollback)
            os.replace(rollback, live)
    raise
finally:
    for live, temporary, expected, previous, new_sha in staged:
        temporary.unlink(missing_ok=True)
result = {
    'updated_at_utc': datetime.now(timezone.utc).isoformat(),
    'host': 'beiapi',
    'address': '179.255.125.53',
    'source_commit': commit,
    'release': str(release),
    'homepage': str(target),
    'homepage_sha256': candidate_sha,
    'previous_homepage_sha256': args.expected_before,
    'rollback_html': str(backup),
    'previous_rollout': str(release / 'last-rollout-before.json'),
    'newapi_container': before['newapi_container'],
    'nginx_master_pid': before['nginx_master_pid'],
    'nginx_config_sha256': before['nginx_config_sha256'],
    'container_restarted': False,
    'nginx_changed': False,
    'database_changed': False,
}
if args.expected_nav_before:
    result.update({
        'brand_script': str(nav),
        'brand_script_sha256': digest(nav),
        'previous_brand_script_sha256': args.expected_nav_before,
        'rollback_brand_script': str(release / 'nav-plans-before.js'),
    })
(release / 'deployed.json').write_text(json.dumps(result, indent=2) + '\n')
rollout_temporary = rollout.with_suffix('.json.tmp')
rollout_temporary.write_text(json.dumps(result, indent=2) + '\n')
os.replace(rollout_temporary, rollout)
print(json.dumps(result))
