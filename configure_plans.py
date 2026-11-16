"""Apply independently authorized plans HTML caching and login configuration."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess


def request(method, url, token=None, body=None, panel=False):
    config = ''
    if token:
        config = 'header = "Authorization: Bearer ' + token + '"\n'
    if panel:
        config += 'header = "New-Api-User: 1"\n'
    command = ['curl', '-sS', '--compressed', '--connect-timeout', '10', '--max-time', '45',
               '--config', '-', '-X', method, '-H', 'Content-Type: application/json', url]
    if body is not None:
        command += ['--data-binary', json.dumps(body)]
    response = subprocess.run(command, input=config, capture_output=True, text=True)
    assert response.returncode == 0, f'Transport failed: curl {response.returncode}; inspect live state before retry'
    data = json.loads(response.stdout)
    assert data.get('success'), f'Request failed: {data.get("errors", data.get("message", "unknown"))}'
    return data


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('action', choices=['cache', 'require-login'])
parser.add_argument('evidence', type=Path)
args = parser.parse_args()
args.evidence.mkdir(parents=True, exist_ok=True)

if args.action == 'cache':
    token = Path('/Users/yorick/.cloudflare-api-token-rickuu.com').read_text().strip()
    base = 'https://api.cloudflare.com/client/v4'
    zones = request('GET', base + '/zones?name=rickuu.com', token)['result']
    assert len(zones) == 1 and zones[0]['name'] == 'rickuu.com'
    zone = zones[0]['id']
    hosts = request('GET', base + '/zones/' + zone + '/custom_hostnames?hostname=www.beiapi.cn', token)['result']
    assert any(x['hostname'] == 'www.beiapi.cn' and x['status'] == 'active' for x in hosts)
    endpoint = base + '/zones/' + zone + '/rulesets/phases/http_request_cache_settings/entrypoint'
    before = request('GET', endpoint, token)['result']
    rule = json.loads(Path(__file__).with_name('plans-cache-rule.json').read_text())
    assert not any(x.get('expression') == rule['expression'] or x.get('description') == rule['description'] for x in before['rules']), 'Matching rule already exists; review before retry'
    (args.evidence / 'cloudflare-before.json').write_text(json.dumps(before, indent=2) + '\n')
    # Add one rule; never replace the shared provider ruleset.
    created = request('POST', base + '/zones/' + zone + '/rulesets/' + before['id'] + '/rules', token, rule)['result']
    (args.evidence / 'cloudflare-created.json').write_text(json.dumps({'zone_id': zone, 'ruleset_id': before['id'], 'result': created}, indent=2) + '\n')
    after = request('GET', endpoint, token)['result']
    previous = {x['id']: x for x in before['rules']}
    assert {x['id']: x for x in after['rules'] if x['id'] in previous} == previous, 'An unrelated rule changed'
    owned = [x for x in after['rules'] if x['id'] not in previous]
    assert len(owned) == 1 and all(owned[0].get(k) == v for k, v in rule.items())
    (args.evidence / 'cloudflare-after.json').write_text(json.dumps(after, indent=2) + '\n')
    result = {'rule_id': owned[0]['id'], 'expression': rule['expression'], 'existing_rules_preserved': True}
else:
    token = Path('/Users/yorick/Servers/.beiapi-token').read_text().strip()
    base = 'https://www.beiapi.cn'
    def current():
        # Retain only the authorized option; never persist or print other options.
        options = request('GET', base + '/api/option/', token, panel=True)['data']
        return next(x['value'] for x in options if x['key'] == 'HeaderNavModules')
    before = current()
    modules = json.loads(before)
    after = {**modules, 'plans': {**(modules.get('plans') if isinstance(modules.get('plans'), dict) else {}), 'enabled': True, 'requireAuth': True}}
    backup = args.evidence / 'header-nav-before.json'
    assert not backup.exists(), 'Configuration backup already exists; review before retry'
    backup.write_text(json.dumps({'key': 'HeaderNavModules', 'value': before}, indent=2) + '\n')
    assert current() == before, 'Navigation configuration changed'
    request('PUT', base + '/api/option/', token, {'key': 'HeaderNavModules', 'value': json.dumps(after, ensure_ascii=False, separators=(',', ':'))}, panel=True)
    saved = json.loads(current())
    assert saved == after and {k:v for k,v in saved.items() if k != 'plans'} == {k:v for k,v in modules.items() if k != 'plans'}
    (args.evidence / 'header-nav-after.json').write_text(json.dumps({'key': 'HeaderNavModules', 'value': saved}, ensure_ascii=False, indent=2) + '\n')
    result = {'plans': saved['plans'], 'other_navigation_preserved': True}

result['updated_at_utc'] = datetime.now(timezone.utc).isoformat()
(args.evidence / (args.action + '-result.json')).write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
