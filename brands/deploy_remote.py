"""Install committed branch homepage files and gracefully reload only Nginx."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

source = Path(__file__).resolve().parent
release = source.parent.parent
metadata = json.loads((source / 'source.json').read_text())
public = Path('/usr/share/nginx/html/novapi-home')
backup = release / 'before'

def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

assert run('hostname').strip() == 'beiapi'
assert not backup.exists(), 'Release already applied'
assert not public.exists(), 'New public path exists; review before replacing'
assert digest(Path('/opt/stacks/bingdian-brand-proxy-live/public/home.html')) == metadata['dianapi_home_sha256']
for item in metadata['nginx_files']:
    assert digest(Path(item['target'])) == item['baseline_sha256'], 'Live config changed: ' + item['target']
backup.mkdir(mode=0o700)
for item in metadata['nginx_files']:
    shutil.copy2(item['target'], backup / Path(item['source']).name)
state = {
    'nginx_master_pid': Path('/run/nginx.pid').read_text().strip(),
    'newapi': run('docker', 'inspect', 'new-api', '--format', '{{.Config.Image}} {{.Id}} {{.RestartCount}}').strip(),
    'brands': run('systemctl', 'show', 'novapi-brand-proxy', 'bingdian-brand-proxy-live', '--property=Id,MainPID,NRestarts'),
}
(release / 'state-before.json').write_text(json.dumps(state, indent=2) + '\n')

# Stage all three candidate configs together; preserve every unrelated include.
main = Path('/etc/nginx/nginx.conf').read_text()
needle = 'include /etc/nginx/sites-enabled/*;'
assert main.count(needle) == 1
staged_dianapi = release / 'dianapi-staged.conf'
staged_dianapi.write_text((source / 'nginx/dianapi.cn.conf').read_text().replace(
    '/opt/stacks/bingdian-brand-proxy-live/nginx-locations.conf', str(source / 'nginx/dianapi-locations.conf')))
includes = []
for path in sorted(Path('/etc/nginx/sites-enabled').iterdir()):
    candidate = source / 'nginx/novapi.cn.conf' if path.name == 'novapi.cn' else staged_dianapi if path.name == 'dianapi.cn' else path
    includes.append(f'include {candidate};')
test_config = release / 'nginx-test.conf'
test_config.write_text(main.replace(needle, '\n'.join(includes)))
run('nginx', '-t', '-c', str(test_config))

shutil.copytree(source / 'novapi/public', public)
for directory, dirs, files in os.walk(public):
    os.chmod(directory, 0o755)
    for name in files:
        os.chmod(Path(directory) / name, 0o644)
reloaded = False
try:
    for item in metadata['nginx_files']:
        target = Path(item['target'])
        temporary = target.with_name(target.name + '.homepage-candidate')
        shutil.copy2(source / item['source'], temporary)
        os.replace(temporary, target)
    run('nginx', '-t')
    run('nginx', '-s', 'reload')
    reloaded = True
    # Verify the newly introduced file route before proceeding to CDN changes.
    body = run('curl', '-fsS', '--compressed', '--retry', '2', '--max-time', '20', 'https://www.novapi.cn/novapi-home/')
    assert body.encode() == (source / 'novapi/public/index.html').read_bytes()
    body = run('curl', '-fsS', '--compressed', '--retry', '2', '--max-time', '20', 'https://www.dianapi.cn/bingdian/home.html')
    assert hashlib.sha256(body.encode()).hexdigest() == metadata['dianapi_home_sha256']
except Exception:
    for item in metadata['nginx_files']:
        shutil.copy2(backup / Path(item['source']).name, item['target'])
    run('nginx', '-t')
    if reloaded:
        run('nginx', '-s', 'reload')
    raise
assert Path('/run/nginx.pid').read_text().strip() == state['nginx_master_pid']
assert run('docker', 'inspect', 'new-api', '--format', '{{.Config.Image}} {{.Id}} {{.RestartCount}}').strip() == state['newapi']
assert run('systemctl', 'show', 'novapi-brand-proxy', 'bingdian-brand-proxy-live', '--property=Id,MainPID,NRestarts') == state['brands']
print(json.dumps({'installed': True, 'release': str(release), 'nginx_graceful_reload': True, 'application_services_unchanged': True}))
