# Син Чао — ресторанная платформа

React/TypeScript customer app and staff console, Express/TypeScript modular monolith, PostgreSQL. Deployment target: **https://food.xedoc.ru**, server **82.146.42.213**.

## Current release

- Responsive menu, search, categories, dish details, structured allergens and modifiers.
- Persisted guest cart, server pricing, delivery/pickup, promo codes, scheduled same-day pickup/delivery, pay on receipt.
- Accounts, order history, current status, cancellation, reorder at current prices.
- Server-validated reservations with transaction-safe overlapping capacity, cancellation and history.
- Loyalty ledger, redemption, once-only earning after confirmed payment and completed order; refund of redeemed points on cancellation.
- In-app notifications and minimal aggregate analytics without personal event payloads.
- Staff console `/admin`: orders, received-payment confirmation, reservations, menu/availability, configuration, categories, audit log and opaque table-menu links.
- PostgreSQL migrations, backend authorization, secure production cookies, scrypt passwords, rate limits, same-origin write protection, idempotency.

**This is a deployed V1 implementation in demonstration mode, not a claim that every item in the V1/V2 design document is complete.** Card acquiring, device push, automatic couriers, account recovery and V2 table orders / preorders / split payments / Food Journey are not connected or implemented. Do not treat a cash order as paid until a staff member confirms actual receipt.

## Restaurant content

Confirmed by the owner in chat: name **Син Чао**, phone **+7 908 351-67-77**, address **Октябрьский, Республика Башкортостан, Садовое кольцо, 16/1, 1 этаж, 452614**.

On 2026-09-29 the owner supplied 21 original JPGs exported from https://vk.ru/club240374933: 18 menu pages, an offer with three lunch combos, the logo and the entrance photograph. They are preserved in `public/images/vk-group` (not only the disposable build directory). `server/data/catalog.ts` transcribes **56 menu entries** with prices, portions and the choices explicitly printed on those pages. Photographs in cards, the hero, dish details and the cart are clipped from the unchanged original pages. The menu also links to full-size originals. The address, phone, entrance photo and map link are shown in Contacts.

`npm run seed` runs the versioned, transactional `importCatalog` once. It replaces the original eight demo dishes, records before/after data in the audit log and preserves orders, accounts and operational settings. Subsequent runs preserve staff edits. Deploy takes a database backup **before** migrations/content import. Alcohol is informational, restaurant-only, and rejected by server-side cart pricing.

The real menu is published with `menuVerified=true`. Hours, delivery zones/fees, capacity, loyalty rules and promotions still require operator confirmation, so `demo=true` remains: online orders and bookings are explicitly test flows. Ingredient descriptions are transcribed from the menu; full allergen information and unspecified drink flavours/volumes must be checked with the restaurant. Online card acquiring remains unconnected.

## Local setup

Node 22.14+ / Node 24 recommended, PostgreSQL 14+.

```sh
npm ci
cp .env.example .env
# Set DATABASE_URL and APP_ORIGIN. Never commit .env.
node --env-file=.env --import tsx server/migrate.ts
node --env-file=.env --import tsx server/seed.ts
npm run build
node --env-file=.env dist/server.js
```

For Vite development run `npm run dev` alongside `node --env-file=.env --import tsx server/index.ts`; set APP_ORIGIN to the exact Vite origin. Environment files are intentionally not implicitly loaded by production scripts.

## Verification

Use a **separate database whose name ends in `_test`**. The integration suite refuses other names and resets only that isolated database.

```sh
node --env-file=.env.test --import tsx server/migrate.ts
node --env-file=.env.test --import tsx server/seed.ts
node --env-file=.env.test --import tsx --test tests/*.test.ts
npm run build
```

Integration tests cover real PostgreSQL transactions, total tampering, modifier validation, ownership, cross-origin writes, staff authorization, concurrent duplicate orders, lifecycle/payment/loyalty, reordered prices, refunds, delivery and overlapping reservation races. Browser checks cover desktop/mobile, modifiers/cart, reservation and guest order flows.

## Business decisions

- Money is integer kopecks. One loyalty point is one ruble; discounts apply before redemption; delivery does not earn points. Redemption is committed with order creation and refunded once on cancellation.
- Order creation locks the customer (across sessions), then the cart. Reservation creation serializes the owner's idempotency key and locks the selected date to validate overlapping capacity.
- Seating is a preference; V1 reserves capacity, never guarantees a named table.
- Delivery zones use explicitly configured street names, validated on the server. This is a basic restaurant-managed zone list, not a geocoder or radius guarantee; staff should verify the full address before confirmation.
- Hours apply daily; same-day fulfillment and bounded advance reservation horizon. Complex weekly schedules, blackouts and holidays need follow-up work before they are advertised.
- Guest history is attached to the account on sign-in from the same session. Raw session tokens never enter the database.
- QR V1 is menu browsing with table context; QR table ordering is V2.
- Analytics retains only allowlisted event names/timestamps for 90 days. API responses and personal data are never offline-cached.

## Production operation

Paths: `/opt/food-sinchao/releases/<release>`, atomic symlink `/opt/food-sinchao/current`, secret configuration `/etc/food-sinchao.env` (root-only). Service `food-sinchao`, loopback port 3187. Dedicated PostgreSQL role/database `food_sinchao`; no Docker required. Nginx vhost is separate from existing sites.

The user creates their own account through the site. Assign the intended registered email server-side after owner authorization; never ask for the user's password:

```sh
cd /opt/food-sinchao/current
set -a; . /etc/food-sinchao.env; set +a
npx tsx scripts/set-role.ts owner@example.com ADMIN
```

Before updating, take a backup with `deploy/backup.sh`, copy a built release, install dependencies with `npm ci`, apply migrations, switch the symlink, restart and check `/api/health`. Rollback: point `current` to the prior release and restart; review migration compatibility before rollback. Database is outside the release directory. Backups are local; copy them off-host for disaster recovery. Automatic nightly backup is enabled on the deployment host.

To inspect: `systemctl status food-sinchao`, `journalctl -u food-sinchao`, `nginx -t`. HTTPS uses the server's Certbot renewal mechanism.
