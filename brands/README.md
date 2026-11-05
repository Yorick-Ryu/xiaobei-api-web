# Novapi and Dianapi public homepage caching

Novapi's existing public display HTML is captured from `https://home.novapi.cn/`
and served at the current host's `/novapi-home/`. Its logo is copied byte-for-byte
to a hashed same-origin asset. Sign-in links use the current origin and leave the
iframe on an explicit click. Nginx overrides the website homepage URL response;
shared database options, brand proxy code and direct API routes are unchanged.
Dianapi keeps the existing `/bingdian/home.html` file, checked against its source
hash without rewriting it. The public root HTML and both display pages receive
five-minute cache headers; authentication and management paths retain their
existing behavior. Only website virtual hosts receive root HTML caching.

`cloudflare-cache-rule.json` is the exact allowlist to add in the `rickuu.com`
SaaS provider zone. The existing token cannot manage modern Cache Rules; use the
logged-in account that owns this zone. Match only the two named website hosts and
public paths in the expression. Mark eligible, respect origin Edge TTL (bypass
when absent), and respect origin Browser TTL. Preserve BeiAPI's existing Page
Rules and unrelated Cache Rules. Record the displayed rule ID and final ordering
in the release evidence. No permission expansion or plan purchase is required.

Before deploying, verify `ssh beiapi` is `179.255.125.53`. Commit all source,
archive that commit, and extract as `source/` inside a private release directory
under `/opt/stacks/brand-homepage/releases/`. Run
`python3 source/brands/deploy_remote.py`. The script conflict-checks and snapshots
all three exact config targets, validates a full staged Nginx config, checks new
public routes after a graceful reload, and preserves application service PIDs.
No application restart, database write or DNS change is needed.

Rollback after checking later edits: restore only the three files in the release's
`before/`, validate with `nginx -t`, gracefully reload Nginx, then disable only this
release's new Cache Rule and purge its public HTML URLs. Keep old homepage hosts
and live application/database state. Query `/opt/stacks/brand-homepage/last-rollout.json`
for the deployed source, verification and rollback point.
