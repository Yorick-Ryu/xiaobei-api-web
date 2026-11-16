"""Select BeiAPI's native homepage after the matching application is deployed."""
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

from native_frontend_config import native_plans_config


def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout.strip()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def state():
    return {
        'newapi': run('docker', 'inspect', 'new-api', '--format', '{{.Id}} {{.RestartCount}}'),
        'nginx_master_pid': Path('/run/nginx.pid').read_text().strip(),
    }


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--expected-config', required=True)
parser.add_argument('--expected-app-revision', required=True)
parser.add_argument('--native-plans', action='store_true', help='Switch plans to the native app and retire forced navigation injection')
args = parser.parse_args()
source = Path(__file__).resolve().parent
release = source.parent
commit = (release / 'source-commit.txt').read_text().strip()
assert re.fullmatch(r'[0-9a-f]{40}', commit), 'Invalid source commit'
assert re.fullmatch(r'[0-9a-f]{64}', args.expected_config), 'Invalid configuration hash'
assert re.fullmatch(r'[0-9a-f]{40}', args.expected_app_revision), 'Invalid app revision'
assert run('docker', 'inspect', 'new-api', '--format', '{{index .Config.Labels "org.opencontainers.image.revision"}}') == args.expected_app_revision, 'Deploy the verified native-home application first'
assert run('hostname') == 'beiapi', 'Wrong host'
assert '179.255.125.53/32' in run('ip', '-4', '-o', 'address', 'show', 'dev', 'eth0'), 'Wrong address'
site = Path('/etc/nginx/sites-available/beiapi.cn')
assert site.resolve() == site and site.is_file(), 'Unexpected site configuration'
assert digest(site) == args.expected_config, 'Live site changed'
original_stat = site.stat()
text = site.read_text()
# Remove only BeiAPI's fixed response: the existing general proxy location now
# serves the backend-configured homepage, including an empty native-home choice.
old_response = """    location = /api/home_page_content {
        if ($request_method !~ ^(GET|HEAD)$) { return 405; }
        default_type application/json;
        add_header Cache-Control "no-store";
        return 200 '{"success":true,"message":"","data":"https://$host/beiapi-home/"}';
    }

"""
assert text.count(old_response) == 1, 'Unexpected homepage response'
candidate = release / 'nginx-candidate.conf'
candidate_text = text.replace(old_response, '')
if args.native_plans:
    candidate_text = native_plans_config(candidate_text)
candidate.write_text(candidate_text)
backup = release / 'nginx-before.conf'
assert not backup.exists(), 'Release already applied'
before = state()
main = Path('/etc/nginx/nginx.conf').read_text()
include = 'include /etc/nginx/sites-enabled/*;'
assert main.count(include) == 1, 'Unexpected Nginx includes'
enabled = list(Path('/etc/nginx/sites-enabled').iterdir())
assert sum(p.resolve() == site for p in enabled) == 1, 'Site not uniquely enabled'
includes = [f'include {p};' for p in sorted(enabled) if p.resolve() != site]
includes.append(f'include {candidate};')
test_config = release / 'nginx-test.conf'
test_config.write_text(main.replace(include, '\n'.join(includes)))
run('nginx', '-t', '-c', str(test_config))
# A new compatibility asset leaves the old app and its script untouched.
if args.native_plans:
    asset = Path('/usr/share/nginx/html/beiapi-assets/home-frame-scroll.js')
    assert not asset.exists(), 'Compatibility asset already exists; review before retrying'
    shutil.copy2(source / 'beiapi-assets/home-frame-scroll.js', asset)
    os.chmod(asset, 0o644)
shutil.copy2(site, backup)
os.chmod(backup, 0o600)
temporary = site.with_name(site.name + '.' + commit[:12] + '.tmp')
try:
    assert digest(site) == args.expected_config and state() == before, 'Live state changed'
    shutil.copy2(candidate, temporary)
    os.chmod(temporary, stat.S_IMODE(original_stat.st_mode))
    os.chown(temporary, original_stat.st_uid, original_stat.st_gid)
    os.replace(temporary, site)
    run('nginx', '-t')
    run('nginx', '-s', 'reload')
    assert state() == before, 'Application or Nginx master changed'
except Exception:
    if digest(site) == digest(candidate):
        shutil.copy2(backup, temporary)
        os.chmod(temporary, stat.S_IMODE(original_stat.st_mode))
        os.chown(temporary, original_stat.st_uid, original_stat.st_gid)
        os.replace(temporary, site)
        run('nginx', '-t')
        run('nginx', '-s', 'reload')
    raise
finally:
    temporary.unlink(missing_ok=True)
result = {
    'updated_at_utc': datetime.now(timezone.utc).isoformat(),
    'source_commit': commit,
    'release': str(release),
    'native_homepage': True,
    'native_plans': args.native_plans,
    'application_revision': args.expected_app_revision,
    'previous_config_sha256': args.expected_config,
    'config_sha256': digest(site),
    'rollback_config': str(backup),
    'nginx_graceful_reload': True,
    'container_restarted': False,
    **before,
}
(release / 'deployed.json').write_text(json.dumps(result, indent=2) + '\n')
index = Path('/opt/stacks/beiapi-homepage/last-native-home-rollout.json')
index.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
