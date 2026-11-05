# BeiAPI same-origin public homepage

The public display page is served at `/beiapi-home/` on BeiAPI's existing website
hosts. Nginx's domain-specific `/api/home_page_content` returns the current host's
URL, leaving the shared NewAPI database option and other brands unchanged.
The NewAPI application shell and the homepage HTML use five-minute public caching
with background revalidation. Extracted, content-hashed images use one-year
immutable caching. Existing hashed NewAPI JS/CSS already have CDN caching.

Source was captured from the live `https://beiapi.top/`; its checksum and the
exact Nginx baseline are in `source.json`. Embedded images were extracted without
changing their bytes. Sign-in links now resolve on the current hostname. The
video remains on its existing dedicated assets host and loads only on demand.

`cloudflare-page-rules.json` contains the exact two public URL patterns. Apply
with `python3 cloudflare.py <evidence-directory>` using the existing provider-zone
token; the script snapshots and preserves unrelated rules. Rules cover only
`https://www.beiapi.cn/` and `https://www.beiapi.cn/beiapi-home/*`.
The live provider zone and active SaaS hostname are checked before writes.

Deploy only a committed `git archive` to a private release directory on `ssh beiapi`
(address must be verified as `179.255.125.53`). Extract it as `source/` and run
`python3 source/deploy_remote.py`. It conflict-checks the live config, preserves
rollback data, validates the complete staged Nginx configuration, installs static
files, and uses a graceful reload. No container/service restart or database write.
Record the source commit, verification and release path in the Servers artifacts.

Rollback: after checking for later edits, restore that release's
`nginx-before.conf` to `/etc/nginx/sites-available/beiapi.cn`, run `nginx -t`, then
`nginx -s reload`. Delete only the Page Rule IDs recorded as created by this
release and purge only its two HTML URLs. Keep the old `beiapi.top` deployment.
