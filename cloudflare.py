"""Apply only the two committed Page Rules to BeiAPI's live SaaS provider zone."""
import argparse
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('evidence', type=Path)
args = parser.parse_args()
args.evidence.mkdir(parents=True, exist_ok=True)
zone_name = 'rickuu.com'
zone_id = '1cba2fbe642ffe8e3ea281d07059d49c'
token = Path('/Users/yorick/.cloudflare-api-token-rickuu.com').read_text().strip()

def request(method, path, body=None):
    config = 'header = "Authorization: Bearer ' + token + '"\n'
    command = ['curl', '-sS', '--max-time', '25', '--config', '-', '-X', method,
               '-H', 'Content-Type: application/json', 'https://api.cloudflare.com/client/v4' + path]
    if body is not None:
        command += ['--data-binary', json.dumps(body)]
    response = subprocess.run(command, input=config, capture_output=True, text=True, check=True)
    data = json.loads(response.stdout)
    if not data.get('success'):
        raise RuntimeError(json.dumps({'path': path, 'errors': data.get('errors')}, ensure_ascii=False))
    return data['result']

zones = request('GET', '/zones?name=' + zone_name)
assert any(z['id'] == zone_id and z['name'] == zone_name for z in zones)
hosts = request('GET', '/zones/' + zone_id + '/custom_hostnames?hostname=www.beiapi.cn')
assert any(h['hostname'] == 'www.beiapi.cn' and h['status'] == 'active' for h in hosts)
endpoint = '/zones/' + zone_id + '/pagerules'
before = request('GET', endpoint)
(args.evidence / 'cloudflare-page-rules-before.json').write_text(json.dumps(before, indent=2) + '\n')
created = []
for rule in json.loads(Path(__file__).with_name('cloudflare-page-rules.json').read_text()):
    body = {k: v for k, v in rule.items() if k != 'description'}
    assert not any(x['targets'] == body['targets'] for x in before), 'Matching rule exists; review instead of replacing'
    result = request('POST', endpoint, body)
    created.append(result)
    (args.evidence / 'cloudflare-page-rules-created.json').write_text(json.dumps(created, indent=2) + '\n')
    print(json.dumps({'created': result['id'], 'targets': result['targets'], 'actions': result['actions']}), flush=True)
after = request('GET', endpoint)
(args.evidence / 'cloudflare-page-rules-after.json').write_text(json.dumps(after, indent=2) + '\n')
assert all(any(x['id'] == item['id'] for x in after) for item in created)
