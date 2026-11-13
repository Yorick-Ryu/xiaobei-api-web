# BeiAPI same-origin public homepage

Repository: <https://github.com/Yorick-Ryu/xiaobei-api-web>. The current
BeiAPI-hosted homepage source is `public/index.html`; root `index.html`,
`plans.html` and their assets retain the earlier standalone site.

Local preview: run `python3 preview.py` and open
`http://localhost:8787/beiapi-home/`. It embeds the actual public page so its
standalone header stays hidden, as in production, resolves same-origin assets,
and opens console links in the existing
local NewAPI at `http://localhost:3001`. It does not change production or database
homepage settings.

Theme and layout conventions: [homepage design](docs/homepage-design.md).

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
The live provider zone and active SaaS hostname are checked before writes. Browser
TTL is scoped to five minutes, overriding the provider zone's four-hour minimum;
longer origin asset TTLs remain effective. Re-running with the same evidence
directory may update only this release's recorded rules after a conflict check.

For an HTML-only update, extract a committed `git archive` as `source/` inside a
new private release directory, save the archive's exact commit in
`source-commit.txt`, and run `python3 source/deploy_content_remote.py
--expected-before <live-html-sha256>`. It checks the host, baseline and unchanged
assets, preserves rollback HTML, and atomically replaces only the homepage.
It does not reload or restart services. Purge only the changed public HTML URLs.
For a reviewed brand-script update, add
`--expected-nav-before <live-nav-plans-sha256>`; this also checks and preserves
the live script before replacing it. Both files roll back if installation fails.
After checking for later edits, rollback restores the recorded `index-before.html`
atomically and purges the same URLs. No application or database changes are needed.

The original `deploy_remote.py` is for the initial Nginx installation:
deploy only a committed `git archive` to a private release directory on `ssh beiapi`
(address must be verified as `179.255.125.53`). Extract it as `source/` and run
`python3 source/deploy_remote.py`. It conflict-checks the live config, preserves
rollback data, validates the complete staged Nginx configuration, installs static
files, and uses a graceful reload. No container/service restart or database write.
Record the source commit, verification and release path in the Servers artifacts.

Rollback: after checking for later edits, restore that release's
`nginx-before.conf` to `/etc/nginx/sites-available/beiapi.cn`, run `nginx -t`, then
`nginx -s reload`. Delete only the Page Rule IDs recorded as created by this
release and purge only its two HTML URLs. Keep the old `beiapi.top` deployment.
