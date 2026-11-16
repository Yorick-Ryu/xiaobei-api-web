# Agent brand overrides

These complete service entrypoints preserve the live BeiAPI-hosted brand filters and
force `HeaderNavModules.plans` to `{enabled:false,requireAuth:true}`. All other
navigation settings remain intact. The frontend uses this shared status configuration;
it does not identify agent sites by hostname.

- `novapi/server.js` replaces `/opt/stacks/novapi-brand-proxy/server.js`.
- `dianapi/server.cjs` replaces `/opt/stacks/bingdian-brand-proxy-live/server.cjs`.
- Existing environment and public assets remain runtime dependencies.
- Validate with `node --test brands/proxy-overrides/tests/plans.test.cjs`.

Before deployment, verify live source hashes against the captured release record and
preserve rollback files. Service entrypoint changes require an explicitly authorized
restart; copying files alone does not activate them.

After the matching NewAPI revision is deployed, the gated
`deploy_native_home_remote.py --native-plans` switch removes the standalone `/plans`
location and replaces forced navigation injection with `home-frame-scroll.js`.
The `/plans/` redirect and iframe homepage compatibility remain. Rollback restores the
previous Nginx configuration and application; standalone HTML files are retained.
