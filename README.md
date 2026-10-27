# Син Чао — ресторанная платформа

React/TypeScript customer app and staff console, Express/TypeScript modular monolith, PostgreSQL. Deployment target: **https://sinchao.ru**, server **82.146.42.213**. Repository: **https://github.com/WizardJIOCb/sinchao.ru**.

## Current release

- Responsive menu, search, categories, dish details, structured allergens and modifiers.
- Persisted guest cart, server pricing, delivery/pickup, promo codes, scheduled same-day pickup/delivery, pay on receipt.
- Accounts, order history, current status, cancellation, reorder at current prices.
- Server-validated reservations with transaction-safe overlapping capacity, cancellation and history.
- Loyalty ledger, redemption, once-only earning after confirmed payment and completed order; refund of redeemed points on cancellation.
- In-app notifications and minimal aggregate analytics without personal event payloads.
- Staff console `/admin`: orders, received-payment confirmation, reservations, menu/availability, configuration, categories, audit log and opaque table-menu links.
- PostgreSQL migrations, backend authorization, secure production cookies, scrypt passwords, rate limits, same-origin write protection, idempotency.

**V2 is implemented with the existing demonstration mode retained.** Table bookings, preorders, QR orders, shared bills, discovery and loyalty features are described below. Card acquiring, device push, automatic couriers and account recovery are not connected. Do not treat a cash order as paid until a staff member confirms actual receipt.

## Restaurant content

Confirmed by the owner in chat: name **Син Чао**, phone **+7 908 351-67-77**, address **Октябрьский, Республика Башкортостан, Садовое кольцо, 16/1, 1 этаж, 452614**.

On 2026-09-29 the owner supplied 21 original JPGs exported from https://vk.ru/club240374933: 18 menu pages, an offer with three lunch combos, the logo and the entrance photograph. They are preserved in `public/images/vk-group` (not only the disposable build directory). `server/data/catalog.ts` transcribes **56 menu entries** with prices, portions and the choices explicitly printed on those pages. Photographs in cards, the hero, dish details and the cart are clipped from the unchanged original pages. The menu also links to full-size originals. The address, phone, entrance photo and map link are shown in Contacts.

`npm run seed` runs the versioned, transactional `importCatalog` once. It replaces the original eight demo dishes, records before/after data in the audit log and preserves orders, accounts and operational settings. Subsequent runs preserve staff edits. Deploy takes a database backup **before** migrations/content import. Alcohol is informational, restaurant-only, and rejected by server-side cart pricing.

The real menu is published with `menuVerified=true`. Hours, delivery zones/fees, capacity, loyalty rules and promotions still require operator confirmation, so `demo=true` remains: online orders and bookings are explicitly test flows. Ingredient descriptions are transcribed from the menu; full allergen information and unspecified drink flavours/volumes must be checked with the restaurant. Online card acquiring remains unconnected.

## Install on Android

Open **https://sinchao.ru** in Chrome and tap the phone icon in the header, or use Chrome's menu → Install app / Add to Home screen. The PWA launches from its own icon; orders and bookings require internet. With no connection, it shows a retry button and the restaurant phone. Installation behaviour depends on the phone/browser. See [Android installation and optional APK packaging](docs/ANDROID.md).

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
node --env-file=.env.test --import tsx --test --test-concurrency=1 tests/*.test.ts
npm run build
```

Integration tests cover real PostgreSQL transactions, total tampering, modifier validation, ownership, cross-origin writes, staff authorization, concurrent duplicate orders, lifecycle/payment/loyalty, reordered prices, refunds, delivery and overlapping reservation races. Browser checks cover desktop/mobile, modifiers/cart, reservation and guest order flows.

## Business decisions

- Money is integer kopecks. One loyalty point is one ruble; discounts apply before redemption; delivery does not earn points. Redemption is committed with order creation and refunded once on cancellation.
- Order creation locks the customer (across sessions), then the cart. Reservation creation serializes the owner's idempotency key and locks the selected date to validate overlapping capacity.
- V2 reserves a specific compatible table under a date lock; global capacity is also checked. Unverified floor plans are only selectable in demo mode.
- Delivery zones use explicitly configured street names, validated on the server. This is a basic restaurant-managed zone list, not a geocoder or radius guarantee; staff should verify the full address before confirmation.
- Hours apply daily; same-day fulfillment and bounded advance reservation horizon. Complex weekly schedules, blackouts and holidays need follow-up work before they are advertised.
- Guest history is attached to the account on sign-in from the same session. Raw session tokens never enter the database.
- Permanent QR links show the menu; staff opens a visit with a fresh six-digit code. Only joined guests can order, call staff and view the shared bill. Closing a visit revokes access.
- Analytics retains only allowlisted event names/timestamps for 90 days. API responses and personal data are never offline-cached.

## Production operation

Paths: `/var/www/sinchao.ru/releases/<release>`, atomic symlink `/var/www/sinchao.ru/current`, secret configuration `/etc/food-sinchao.env` (root-only). Service `food-sinchao`, loopback port 3187. Dedicated PostgreSQL role/database `food_sinchao`; no Docker required. Nginx vhost is separate from existing sites.

The user creates their own account through the site. Assign the intended registered email server-side after owner authorization; never ask for the user's password:

```sh
cd /var/www/sinchao.ru/current
set -a; . /etc/food-sinchao.env; set +a
npx tsx scripts/set-role.ts owner@example.com ADMIN
```

Before updating, take a backup with `deploy/backup.sh`, copy a built release, install dependencies with `npm ci`, apply migrations, switch the symlink, restart and check `/api/health`. Rollback: point `current` to the prior release and restart; review migration compatibility before rollback. Database is outside the release directory. Backups are local; copy them off-host for disaster recovery. Automatic nightly backup is enabled on the deployment host.

To inspect: `systemctl status food-sinchao`, `journalctl -u food-sinchao`, `nginx -t`. HTTPS uses the server's Certbot renewal mechanism. See [domain deployment and rollback](docs/DEPLOYMENT.md).

## Visual theme

`src/menu-theme.css` applies the owner's printed-menu style across the app: cream paper, olive accents, red prices and locally hosted Cyrillic Lobster headings. `public/images/theme/bamboo-paper.jpg` is an AI-generated decorative watercolour background, optimised to 299 KB. The homepage uses a separate generated pho illustration (`pho-hero.webp`, 1254 × 1254, 299 KB); its provenance and prompt are in `docs/HERO_IMAGE.md`. Menu cards, entrance and logo retain the original owner-supplied VK photographs. The combo banner follows the hero. On screens <=360px menu cards switch to one column to keep long names readable; larger phones retain two columns.

## V2 operation

Customer discovery is at `/discover` (header “Открытия” and Food Journey shortcut).
Staff tools: `/admin` → “V2 · Зал и гости”.

1. Configure tables and download printable QR PNGs under “Столы и QR”. Confirm the real floor layout in “Правила V2”; the initial layout is explicitly an example.
2. Guests select date/time/table and optionally attach the current basket to their reservation. Pre-order prices are snapshotted; staff checks availability and activates the pre-order when opening the reservation's visit on arrival.
3. Open a visit, give guests its code. Their QR baskets create kitchen orders. Handle waiter/bill requests in the hall panel.
4. Guest or staff prepares equal bill shares (one share = a single bill). New orders are locked until an unpaid split is reset. Confirm each actual payment. Complete paid kitchen orders, then close the visit. Gift credit also pays individual shares.
5. Events are explicitly published by a manager, with controlled signup capacity. No invented events are seeded.
6. Gift requests become usable only after staff confirms receipt. Partial redemptions are transactional and logged. The same request key cannot spend twice. Active/used certificates cannot simply be cancelled; refunds require an operator process.
7. Favourites/preferences explain recommendations; unknown allergen lists are excluded when allergen exclusions are set. Food Journey/achievements use paid, completed orders. Regions come from restaurant dish data; unspecified regions use a general discovery route.
8. Referral codes are accepted before the first completed order; invitee and inviter are rewarded once on the first qualifying completion. The reward and program switch are configurable.

The existing demo flag remains enabled until real operational settings are approved. Card acquiring, automatic refunds and external push/SMS are not connected; payment confirmations are staff actions. Full V2 scope and verification notes: `docs/V2.md`.

### Dish achievements and promotions

Profile and Food Journey show an achievement for each food dish (44 in the current catalogue), with levels at 1/3/5/10/20 paid, completed orders. A dish counts once per order regardless of portions/modifier lines. Historical orders are included. Anonymous or other customers' orders do not contribute. These badges are cosmetic, not monetary rewards.

`/admin` → “Промокоды и ачивки” lets ADMIN/MANAGER create, disable and edit percentage promotions (eligible dishes, basket minimum, start/end, total usage limit) and rename, hide or change five ascending thresholds for each achievement. Dates are entered in the device timezone and stored as UTC. Rule edits recalculate historical progress. Draft code `480` (Фо Бо) starts disabled with 0%; set a discount before enabling. Existing legacy restaurant promo remains supported; a managed code of the same name takes precedence.

Promotion pricing applies to eligible dish lines including modifiers, before loyalty redemption; delivery is excluded. Checkout and QR table orders revalidate server-side, lock the promotion row and increment usage once within the order transaction. Quotes reserve nothing. Cancelled orders retain usage, as disclosed in admin. Preorders do not take a promo. Edits are audit-logged.

Owner-approved hall inventory: 14 rectangular tables × 4, 3 round × 2 and one long VIP × 4 = 66 seats. After migration 006, run `scripts/configure-hall-20260930.ts` once with the production environment loaded. It guards the expected original inventory, preserves existing table IDs/QR tokens and bookings, and logs changes. Positions remain an explicitly unverified example editable in the table form.

### Operator and staff access

Order cards in both the operator dashboard and the Orders tab show the full creation date/time and the requested delivery/pickup date/time in the configured restaurant timezone. Scheduled slots use the original order day; ASAP is shown as “Как можно скорее” without inventing a deadline.

Yandex Metrica counter **113678160** is loaded by `public/metrika.js`, with Webvisor, click/link maps, accurate bounce tracking and the `dataLayer` ecommerce option enabled. The external bootstrap preserves the ban on inline JavaScript; the server CSP permits the explicit Metrica endpoints and HTTPS replay viewers documented by Yandex. Ecommerce events require separate `dataLayer` integration.

Admin opens the operator dashboard by default: all active orders, today's reservations, active tables/visits and waiter calls, refreshed every 10 seconds while visible. Select a table to seat guests with or without a booking; existing seating/conflict checks apply. Follow links to the order, reservation and bill controls. Dates use restaurant time. The global demo notice is removed at the owner's request; this visual change does not toggle operational configuration.

ADMIN → “Пользователи и права”: search registered accounts by name/email and assign CUSTOMER (guest), STAFF (operator), MANAGER or ADMIN with an explicit confirmation. Only ADMIN may read this directory or change roles. Role edits are audit-logged, reject stale expected roles and re-check the actor in a serialized transaction. Self-demotion is blocked; simultaneous cross-demotions cannot remove the final administrator. Current rights are read from the database on every API request; refresh the client UI after a role change.

### Optional tips and general achievements

Checkout offers no tip (default), 5/10/15/20% or a custom ruble amount. Percentages use food after discounts/loyalty, excluding delivery. A table visit has one shared tip, editable by members before bill preparation/payment, in both its bill panel and QR cart. Optimistic version checks prevent overwriting another guest's choice. Equal shares preserve every kopeck, including tips. Staff sees tips separately and confirms receipt together with payment. Gift certificates and loyalty do not cover tips; tips earn no loyalty points.

Profile and Journey include Счётный магнат (settled bills), Чай-палпатин (paid tips), Диванный гурман (delivery), Самовывозвышение (pickup), each with five configurable levels. Only paid, completed orders count; a closed table visit counts once per guest with qualifying orders. A shared table tip is credited once to the registered guest who saved the final choice, after all shares are paid and the visit closes. ADMIN/MANAGER can rename, hide and change thresholds under “Промокоды и ачивки” → “Общие ачивки”.

### Table QR cards and guest service

`/admin` → “V2 · Зал и гости” → “Столы и QR” offers a 1200px QR PNG, copy/open link, a printable card for one table and a complete set for all active tables. The print preview uses four branded cards per A4 sheet; disable browser headers/footers and use 100% scale. The same print dialog can save a PDF. Static QR links retain each existing table token and never contain the rotating visit code.

Staff opens a visit and gives its six-digit code to the guests. A guest scans the table card, sees the menu immediately and joins without registration. The table page has prominent reorder, waiter-call and bill/payment actions. The shared bill shows orders, tips, paid amount and equal payment shares. Preparing the bill pauses new orders. After a visit closes, guests must join the next visit with its new code. Scanning another table never selects the previous table's visit, and a QR cart cannot silently become a delivery/pickup order before joining.

YooKassa card/SBP payments are prepared but **disabled by default**. Only verified provider API status can settle a payment share. Concurrent guests and retries reuse a durable payment attempt; pending online payments prevent duplicate cash/certificate receipts and bill changes. Real-mode acquiring also rejects demo bills. Activation requires the restaurant's YooKassa account, server-side credentials and confirmed receipt process; see [online-payment setup](docs/ONLINE_PAYMENTS.md). Existing pay-on-receipt remains available while acquiring is disabled.
