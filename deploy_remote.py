"""Install this committed public homepage release and gracefully reload Nginx."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

source = Path(__file__).resolve().parent
release = source.parent
site = Path('/etc/nginx/sites-available/beiapi.cn')
public = Path('/usr/share/nginx/html/beiapi-home')
metadata = json.loads((source / 'source.json').read_text())

def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout

assert run('hostname').strip() == 'beiapi'
assert hashlib.sha256(site.read_bytes()).hexdigest() == metadata['nginx_base_sha256'], 'Live site changed; review before deploying'
assert not public.exists(), 'Homepage target already exists; review before replacing'
assert not (release / 'nginx-before.conf').exists(), 'Release already applied'
shutil.copy2(site, release / 'nginx-before.conf')
state = {
    'image': run('docker', 'inspect', 'new-api', '--format', '{{.Config.Image}}').strip(),
    'container': run('docker', 'inspect', 'new-api', '--format', '{{.Id}} {{.RestartCount}}').strip(),
    'nginx_master_pid': Path('/run/nginx.pid').read_text().strip(),
}
(release / 'state-before.json').write_text(json.dumps(state, indent=2) + '\n')

# Validate the candidate in the complete live configuration, without activating it.
main = Path('/etc/nginx/nginx.conf').read_text()
needle = 'include /etc/nginx/sites-enabled/*;'
assert main.count(needle) == 1
includes = [f'include {p};' for p in sorted(Path('/etc/nginx/sites-enabled').iterdir()) if p.name != 'beiapi.cn']
includes.append(f'include {source / "nginx" / "beiapi.cn.conf"};')
test_config = release / 'nginx-test.conf'
test_config.write_text(main.replace(needle, '\n'.join(includes)))
run('nginx', '-t', '-c', str(test_config))

shutil.copytree(source / 'public', public)
for directory, dirs, files in os.walk(public):
    os.chmod(directory, 0o755)
    for name in files:
        os.chmod(Path(directory) / name, 0o644)
try:
    temporary = site.with_name('beiapi.cn.homepage-candidate')
    shutil.copy2(source / 'nginx' / 'beiapi.cn.conf', temporary)
    os.replace(temporary, site)
    run('nginx', '-t')
    run('nginx', '-s', 'reload')
except Exception:
    shutil.copy2(release / 'nginx-before.conf', site)
    run('nginx', '-t')
    raise
assert Path('/run/nginx.pid').read_text().strip() == state['nginx_master_pid']
assert run('docker', 'inspect', 'new-api', '--format', '{{.Id}} {{.RestartCount}}').strip() == state['container']
print(json.dumps({'installed': True, 'release': str(release), 'nginx_graceful_reload': True, 'containers_unchanged': True}))
