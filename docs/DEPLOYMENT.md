# sinchao.ru deployment

Production host: `82.146.42.213`. Source repository: https://github.com/WizardJIOCb/sinchao.ru, branch `main`.

## Layout

- `/var/www/sinchao.ru/releases/<release>`: immutable source checkout, dependencies and build.
- `/var/www/sinchao.ru/current`: active release symlink.
- `/var/www/sinchao.ru/acme`: public HTTP-01 challenge directory, separate from the application.
- `/etc/food-sinchao.env`: root-only configuration; `APP_ORIGIN=https://sinchao.ru`.
- `food-sinchao.service`: existing restricted service account and `127.0.0.1:3187`.
- PostgreSQL database/role `food_sinchao`, unchanged by the domain migration. Uploaded images are in PostgreSQL.
- `/var/backups/food-sinchao`: database dumps, backed up nightly by `food-sinchao-backup.timer`.

The old `/opt/food-sinchao` release remains available for rollback. Never commit server environment files, database dumps or printed table QR documents.

## Deploy an update

Run as root on the production host. Choose a unique release name and clone the requested reviewed commit from `main` into `/var/www/sinchao.ru/releases/<release>`; check its exact commit before activating. Run `bash deploy/activate.sh <release>` from that checkout. The script installs dependencies, builds, backs up PostgreSQL, applies migrations and the guarded seed, switches `current` and restarts the service. Inspect the backup and health response. Source pushes trigger validation in GitHub Actions; they do not deploy automatically.

Verify the public HTTPS page, `/api/health`, `/api/menu`, built assets, session cookies, same-origin write protection and an existing table QR path. Confirm `systemctl is-active food-sinchao`, its working directory, `nginx -t`, certificate names/expiry and the nightly backup timer. Do not create live orders just to test a release.

## Domain activation

The apex and `www` A records must resolve publicly to `82.146.42.213`; registration and parent-zone delegation must also be complete. Start with `deploy/nginx.conf` so ACME validation is reachable. Issue a certificate for both names using Certbot's webroot authenticator and `/var/www/sinchao.ru/acme`. Install `deploy/nginx-https.conf` only after certificate issuance.

Only once the new HTTPS origin is publicly reachable, set `APP_ORIGIN=https://sinchao.ru`, restart the application, and install `deploy/nginx-legacy-redirect.conf` for `food.xedoc.ru`. Validate and reload Nginx. The old address and `www` redirect to the canonical HTTPS origin while retaining paths and query parameters, including existing printed table QR links.

Keep the old domain's certificate renewal working: its HTTP challenge path is served locally; use the same webroot for its Certbot renewal configuration. Enable and verify Certbot's existing renewal timer and successful-renewal Nginx reload hook.

For the initial registration's DNS delay, `sinchao-domain-activation.timer` runs `deploy/finalize-domain.sh` every five minutes. It waits for both public resolvers to see both correct A records, limits ACME attempts, obtains the certificate, switches the origin and redirects, and tests renewal. Configuration changes roll back on failure. It disables itself on success or after 24 hours; inspect `/var/lib/food-sinchao-domain/complete`, `expired` and the service journal. It never fetches or deploys a different application commit.

Accounts, passwords, orders, menu edits, table tokens, uploaded images and loyalty remain in the same database. Browser cookies and installed PWAs are tied to an origin: guests and staff need to sign in again on the new domain and reinstall the PWA there if used. Previously recorded verification files describe their historical deployments.

## Additional domain: sinchao.online

`sinchao.online` and `www.sinchao.online` redirect with HTTP 308 to `https://sinchao.ru`, preserving the complete path and query string, including table QR links. The application keeps a single canonical origin and database.

Both alias A records must point to `82.146.42.213`. The registrar must delegate the domain to the DNS servers serving those records, rather than its parking/status-page servers. The DNS-master zone uses `ns3-l2.nic.ru`, `ns4-l2.nic.ru`, `ns8-l2.nic.ru`, `ns4-cloud.nic.ru` and `ns8-cloud.nic.ru`.

Initially install `deploy/nginx-online-bootstrap.conf` as the separate `sinchao.online` Nginx vhost. It serves ACME challenges and returns a temporary HTTP 503 for other paths. `sinchao-online-activation.timer` runs `deploy/finalize-online-alias.sh` every five minutes. Once the primary activation has completed, the primary health endpoint works and both alias names resolve correctly through both public resolvers, it issues a separate certificate, installs `deploy/nginx-online-redirect.conf`, and tests all four HTTP/HTTPS redirects and certificate renewal. It rolls back its own vhost on failure, limits ACME attempts and stops itself on completion or after 24 hours. Inspect `/var/lib/food-sinchao-online-domain/complete`, `expired` and its service journal. The existing Certbot timer and Nginx reload hooks renew the certificate.

## Rollback

Before activation, save the active symlink target, service units, Nginx vhost and root-only environment configuration into a root-only dated directory under `/var/backups/food-sinchao`. Record a fresh database dump and a private database/table-token fingerprint.

To roll back this domain migration, restore the saved environment, service units and old Nginx vhost, remove the newly enabled vhost, run `systemctl daemon-reload`, restart `food-sinchao`, then validate and reload Nginx. Verify `https://food.xedoc.ru/api/health`. No database restore is necessary for the domain migration because it changes no schema or business records. For later releases, assess schema compatibility before switching to an older release.
