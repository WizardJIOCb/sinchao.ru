# Initial deployment acceptance — 2026-09-29 (historical)

## Delivered

- Public URL: https://food.xedoc.ru (HTTP redirects to HTTPS).
- Private repository: https://github.com/WizardJIOCb/vietnam, branch `main`.
- Deployed application commit: `83cd531` (subsequent commits may add this report and smoke-test tooling without changing the application bundle).
- Server: `82.146.42.213`; service `food-sinchao`; current release `/opt/food-sinchao/releases/83cd531`; bind `127.0.0.1:3187`.
- PostgreSQL persistent store, protected environment file, isolated service user, Nginx virtual host, nightly backup timer, first backup verified nonempty.
- Let's Encrypt certificate valid through **2026-12-28**; automated renewal configured by Certbot.

## Checks actually performed

- TypeScript check and production build passed.
- Local PostgreSQL integration suite: **19 passed, 0 failed**, including parent suite; 18 business-flow subtests.
- GitHub Actions success on deployed application commit: https://github.com/WizardJIOCb/vietnam/actions/runs/36590246570. CI installed dependencies, migrated and seeded a separate PostgreSQL database, ran the integration tests, and built the app.
- `npm audit --omit=dev`: no known vulnerabilities reported at verification time.
- Public `/api/health`: HTTP 200, database reachable.
- Public session cookie: `HttpOnly; Secure; SameSite=Lax`. Cross-origin write protection and staff/ownership authorization tested.
- Public demo API flow: menu → cart → server quote → pickup order → idempotent retry → notification. Demo order №2 total **980 ₽**. Reservation created against current server availability. Both records then cancelled.
- Browser delivery flow: two Phở Bò with beef modifiers → **1,220 ₽** subtotal + **150 ₽** delivery → persisted order №1 **1,370 ₽** → history → cancellation. Order explicitly labelled as a test, with fictional test contacts.
- Browser reservation flow at 390px: select 30 September, 12:00, two guests → confirmed persisted booking → cancellation. A date-input event issue discovered during testing was fixed and rechecked.
- Browser staff login on the isolated test database: protected dashboard displays orders and status/payment controls.
- Public mobile menu: eight demo dishes, images loaded, **no horizontal document overflow** at 390px; no browser error entries observed. Desktop hero/menu visually inspected.
- Application bundle SHA256 matches local and server: `bea7a74e46bfb3ff16ce162e0a28f53ca6a69fd48f0f42388fa88a2edd43c1ed`.
- Service active, `NRestarts=0`, memory approximately **26 MiB** at inspection. This is a point-in-time observation, not a load test.

## VK content update — 2026-09-29

The owner supplied 21 JPGs locally: 18 menu pages, one three-combo poster, `logo.jpg` and `contacts.jpg`. All originals are committed under `public/images/vk-group`. The new catalogue contains 56 entries in nine categories, with printed prices, portions, required portion/garnish/flavour selections and original photographs. The hero, cards, dish modal and cart display photographs from the corresponding menu pages; an original-pages viewer is included. The header/footer/favicon use the supplied logo. Contacts show the entrance photograph, full address, telephone and the user-provided 2GIS location.

The old eight demo entries are replaced by a transactional, versioned import; the before/after catalogue is retained in the audit log. Repeat seed/deploy preserves staff edits. Orders and registered accounts are untouched. Database backup now precedes migrations/import. Alcohol is restaurant-only, with backend rejection of online cart requests.

Validated locally before publication:

- Production build / TypeScript pass.
- 22 tests pass, including isolated PostgreSQL business flows, once-only content migration and pricing for real portions, drinks and combos.
- Browser confirms 56 menu cards and category/search controls, original photographs, address/map/phone links and desktop/mobile layout.
- Browser cart: Tom yam 500 g with noodles persists and quotes 550 RUB for pickup.
- 390px browser viewport has document scroll width 375px (remaining width is scrollbar), without horizontal document overflow.
- Published application commit: `17f16e507df7e8eaec4d7d8c93daf71502ba00e0`, release `/opt/food-sinchao/releases/17f16e5`.
- GitHub Actions passed for that exact application commit: https://github.com/WizardJIOCb/vietnam/actions/runs/36595541699.
- Public `/api/health` returns OK; `/api/menu` returns 56 entries, 9 categories, `menuVerified=true`.
- All 21 public JPGs return HTTP 200 / image/jpeg and match local originals byte-for-byte by SHA256 (11,298,655 bytes total).
- Public API cart confirms Tom yam 500 g + noodles = 550 RUB; restaurant-only alcohol is rejected with HTTP 409; test cart was cleared. No production order was created by this content verification.
- Public browser at 1440px and 390px: correct new menu, search for “Миен” returns three matching dishes, 19 original menu pages, real contact photograph and exact 2GIS map link. No horizontal document overflow or browser error entries observed.
- Public frontend bundle matches the local build: SHA256 `85af0aa2489c1c20d143ab11bb8fcb399b8a3df73beee7b27d2437c175bc25cf`.
- Service is active/running with NRestarts=0; nginx configuration validates. Pre-import backup: `/var/backups/food-sinchao/food-sinchao-20260929-190910.sql.gz`.
- Database audit records replacement of 8 demo items with 56 authentic entries; Rodion remains ADMIN.
- Local evidence: `artifacts/public-verification.json`, `menu-update-desktop.png`, `menu-update-mobile.png`, `menu-update-contacts.png` (ignored evidence files, not deployment inputs).

## Remaining launch conditions

Menu content and images now come from the owner's supplied VK files. `menuVerified=true`; `demo=true` still identifies test ordering/booking because opening hours, delivery areas/fees, reservation capacity and loyalty rules require operator confirmation. Customer payment is pay-on-receipt; acquiring, SMS/push and couriers are not connected. V2 was not implemented at this historical checkpoint; see the V2 acceptance section below.

The owner registered Rodion and the authorized ADMIN role was assigned previously; this content update does not change account permissions.

## Printed-menu visual theme — 2026-09-29

- Published application commit `e96243a518f44799541119d681020fe36b68b19b`, release `/opt/food-sinchao/releases/e96243a`.
- Visual reference: the owner's original nem/spring-roll menu page. Warm cream paper, olive navigation, cinnabar prices/buttons, local Cyrillic Lobster display font, watercolour bamboo and plum blossoms.
- Decorative background generated specifically for the theme; restaurant/dish photographs remain the owner's original files. Deployed background is a 298,812-byte JPEG, its public SHA256 matches the local file.
- Theme covers homepage, catalogue, contacts, footer, account/record panels, dish/cart/booking dialogs and mobile navigation. Cards use one column at <=360px so long titles remain readable.
- Production build/TypeScript and catalogue tests pass; full GitHub Actions run passes: https://github.com/WizardJIOCb/vietnam/actions/runs/36597766597.
- Local browser inspected at 1280px, 390px and 320px; public browser inspected at 1280px and 390px. No horizontal document overflow; 320px long drink titles no longer overflow cards. Dish quantity controls correctly display 500 RUB for two nem Hanoi portions. No browser errors observed.
- Public verification confirms all 56 catalogue entries, all 21 original photos byte-for-byte, Tom yam 500g/noodles quote at 550 RUB and the restaurant-only cart restriction. Verification cart cleared, no order created.
- Published stylesheet SHA256 matches local: `b4c3440bdf5179d2abd97caef96e4165f621e4b2a9332dac9fa4304485461ed5`.
- Service active with NRestarts=0, /api/health OK. Backup before activation: `/var/backups/food-sinchao/food-sinchao-20260929-192959.sql.gz`. Full archive upload was interrupted; activation used a checksum-verified 895,512-byte theme release plus the previous release's unchanged VK assets. Menu seed reported existing catalogue preserved.
- Evidence screenshots (ignored local files): `artifacts/paper-theme-live-desktop.png`, `artifacts/paper-theme-live-mobile.png`.

## V2 acceptance — 2026-09-29

- All requested V2 feature areas have working customer and staff flows: floor plan, specific-table reservations, reservation preorders, QR table orders, waiter calls, equal bill splitting, recommendations, Food Journey, achievements, events, certificates and referrals.
- TypeScript and production build pass. The isolated PostgreSQL suite passes **34 tests, 0 failures**, including concurrent reservations/event capacity, ownership restrictions, idempotency, exact kopeck splitting, partial certificate redemption against orders and table shares, and once-only referral rewards.
- Local browser, using the real backend and an isolated test database: staff opens a visit; guest joins through QR/code; Pho Bo order 350 RUB reaches the table; waiter call appears in the staff queue; two shares of 175 RUB are created and one is paid by staff.
- Browser reservation: 30 September, 12:00, two guests, selected table, nem Hanoi preorder 250 RUB. Persisted history shows the selected table and preorder; basket clears after success.
- Browser gift request 1,000 RUB is activated by staff; event creation and signup for two guests succeed; favorites and explanatory recommendations render.
- Desktop 1280px and mobile 390px show no horizontal document overflow or browser error entries. Evidence is in ignored `artifacts/v2-*.png`, `v2-tests.txt` and `v2-build.txt`.
- All mutation-based V2 browser tests ran on the isolated local database. Production events, gift balances and referral rewards were not fabricated for testing.
- The floor layout is an explicitly labelled example until the restaurant confirms it. Menu region metadata is currently empty, so Journey uses a general Vietnam route rather than invented regional attribution. No event is published by default.
- Existing demo ordering/booking remains enabled. Certificate activation and receipt of each bill share are staff confirmations; external acquiring, automatic refunds and push/SMS delivery are not connected.
- Published application commit: `6459f10eb32e179eec58d161f2d9b09f3c14e98d`; release `/opt/food-sinchao/releases/6459f10`. CI succeeded for this exact commit: https://github.com/WizardJIOCb/vietnam/actions/runs/36605133151.
- Backup before migrations 003/004: `/var/backups/food-sinchao/food-sinchao-20260929-202930.sql.gz`. Service active/running, NRestarts=0; public health reports version **2.0.0**. Nginx configuration validates.
- Public read-only checks: 56 dishes, 9 categories, 6 example tables with QR tokens withheld, 6 recommendations, 44 food Journey entries, no fabricated events, gifts or visits. Anonymous staff routes reject with 403; private gifts/referrals reject with 401.
- Before/after database counts match: 1 registered account (Rodion remains ADMIN), 2 existing orders, 2 reservations and 56 dishes. `demo=true`, `menuVerified=true` retained.
- Public browser `/discover` verified at 1280px and 390px without horizontal overflow or browser errors. Journey's Pho Bo link opens `/menu/pho-bo` with original image, portion options and price; closing a directly loaded dish opens the catalogue. The mobile booking dialog shows available tables after choosing date/time; no production booking was submitted during this check.
- Published 349,602-byte JS bundle matches the local build by SHA256: `d0fe49135afa8b568d8f69c4d5e3a4187756651f1d0c25ce92d7d94c344a0848`. Stylesheet SHA256 also matches: `16659cef16a811c91957f410a5b8889feb150a30f3e2411c75434b537309f918`.

## Reservation times and homepage refinement — 2026-09-29

- Bookings now expose the persisted start/end interval and saved restaurant timezone. New bookings snapshot the timezone; migration 005 fills it for existing records. No existing booking is rescheduled.
- Consistent date/time range in guest history, staff reservations, visit selection, seated visit panels, new confirmation/cancellation notices and activated preorders. The form previews the full interval. Actual restaurant configuration is Asia/Yekaterinburg (UTC+5), 90 minutes.
- Production build passes; 35 isolated tests pass, including historical interval formatting, timezone display, midnight end time and booking/visit API consistency. Local browser confirms staff records display the interval and timezone.
- Homepage hero now uses a 1254px generated pho illustration, 299 KB WebP with transparency, rather than magnifying a small crop of a menu page. Prompt/provenance: `docs/HERO_IMAGE.md`.
- Combo banner moved immediately after the hero, before ordering options and featured dishes. Its button still opens exactly the three combo menu entries. Desktop/mobile preview shows no horizontal overflow or browser errors.
- Deployed application commit `0e0a61c682f7396fe4ffc9757118b468f3bdc0d7`; CI success: https://github.com/WizardJIOCb/vietnam/actions/runs/36606886584. Backup `/var/backups/food-sinchao/food-sinchao-20260929-204410.sql.gz`; migration 005 updated all 4 existing bookings with Asia/Yekaterinburg timezone. Existing dates and intervals retained.
- Public health is OK, service active with NRestarts=0. Live browser confirms hero → combo → ordering options → featured dishes, new image at 1254px, no horizontal overflow, booking preview 30.09.2026 · 12:00–13:30 with UTC+5. Verification did not submit a production booking.
- Public hero matches local WebP SHA256 `8584949e20a5e1c4948cbb0e17815c27341e39ade2bb102f79cc2943c41ff66f`.

## Table editor and responsive QR cards — 2026-09-30

- Added explicit Edit actions to every table card and a table selector, including disabled tables; selecting a table brings the name/position form into view. Saving an existing table keeps the editor open and confirms success.
- QR cards use their own responsive grid. Images preserve a square aspect ratio and cannot exceed card width; printable QR output remains 600px.
- TypeScript/build and all 35 existing integration tests pass. Local real-backend browser flow: create a table, reopen with Edit, rename to "Стол у окна", set X=65/Y=55, save, reload, select it from the dropdown and confirm all values persist.
- Responsive browser verification at 320, 390, 600 and 900px: no horizontal document overflow; every QR remains square and within its card. No browser errors observed. Test table mutations ran only in the isolated local database.
- Published release `6c6eb85`; exact-commit CI passed: https://github.com/WizardJIOCb/vietnam/actions/runs/36693557002. Backup before activation: `/var/backups/food-sinchao/food-sinchao-20260930-120359.sql.gz`. Service active, NRestarts=0, public bundle matches local by SHA256.
- Public admin at 390px: all 8 existing table cards have Edit buttons and QR codes fit their cards. Opening the existing "Новый стол" displays the editable name/X/Y form. No production table data was changed during verification.

## Hall inventory, dish achievements and managed promotions — 2026-09-30

- Prepared owner inventory: 14 rectangular × 4 seats, 3 round × 2, long VIP × 4. Migration 006 allows long tables; guarded, idempotent maintenance script preserves eight existing table IDs/QR tokens and reservation references. Isolated rehearsal confirmed 18 tables / 66 seats and no changes on second application. Positions remain explicitly unverified.
- Profile and Journey now show 44 food achievements with five levels, original dish images, progress and links. One qualifying order increments each included dish once. ADMIN/MANAGER can rename/hide achievements and change ascending thresholds, or manage dish-specific percentage promotions, dates, basket minimums and usage limits. Migration 007 creates disabled draft `480` at 0%.
- Promotion quotes and regular/QR checkouts use server pricing; checkout serializes last-use claims and remains idempotent. Tests cover unauthorized access, eligible lines, minimums, dates, disabled codes, concurrent last use, QR replay/conflict, own paid-completed order filtering, cancellation and historical level changes. All **42 isolated tests** and production build pass.
- Local browser at 390px verified saving a promo and an achievement name/threshold, then reading the changed badge in profile. Profile buttons have 48px equal heights and 12px gaps, stacked full-width on mobile; desktop buttons align on one row. No horizontal overflow. Floor shows all 18 tables with no overlapping boxes; every QR fits its card.
- Test fixture initially omitted order modifier display fields and caused a local admin render error; corrected test data, then verified the admin flow successfully. Production orders were not changed for UI testing.
- Added operator dashboard and ADMIN-only user-role management. Extended suite passes **43 tests** including directory privacy, customer/operator/manager denial, role conflict, immediate revocation and simultaneous administrator cross-demotion. Local browser seated guests at a free test table, updated occupancy from 1/2 to 2/2, searched a test user and assigned Operator with confirmation. Both screens fit 390px without document overflow.
- Removed the owner's requested global demo banner; left operational configuration untouched. Profile action buttons remain aligned and responsive.
- Published application release `82858afd2484b8ddc3b7cc89d0b3955071e190f7`; exact-commit CI passed: https://github.com/WizardJIOCb/vietnam/actions/runs/36696946613. Backup: `/var/backups/food-sinchao/food-sinchao-20260930-123522.sql.gz`. Migrations 006/007 applied, catalogue edits preserved, guarded hall script applied once. Service active/running, NRestarts=0; public health OK.
- Production verification: 18 tables, 66 seats, shapes 14 square / 3 round / 1 long; all 8 previous table IDs and QR hashes retained; all 5 existing reservation-to-table references retained. Rodion remains ADMIN. No role changes or fabricated orders were made in production. Draft `480` is disabled with 0% and zero uses.
- Live browser: operator shows 18 tables with existing occupancy/orders/bookings/calls, no demo banner. User-role screen exposes Rodion ADMIN and prevents current admin self-demotion. Profile shows 44 available achievement tracks; buttons are 48px high, aligned at desktop, 303px wide with 12px vertical gaps at 390px. No horizontal overflow or browser errors observed.
- Public JS bundle SHA256 matches local build: `9a950a49ba6f466a32f580fdf53f231c0f576f80458f357b5ad24b2a8089964a`. Screenshots: `artifacts/operator-live-desktop.png`, `artifacts/operator-live-mobile.png`, `artifacts/profile-actions-live-desktop.png`.

## Tips, general achievements and circular badge images — 2026-09-30

- Added voluntary default-off tips to checkout, QR cart and shared table bill, with percentages/custom amounts and separate customer/staff totals. Migration 008 adds versioned visit choices, attributed user, share tip amounts and managed general-achievement rules. Historical records default to no tip.
- Added four general tracks with five levels and manager controls; food badges now clip both image/SVG and their wrapper to circles.
- All 47 isolated tests and production build pass. Coverage includes discounts/points/delivery exclusions, exact split sums, gift exclusions, idempotency, concurrent tip changes, membership/paid-bill locks, cancelled/unsettled exclusions, multi-order visit deduplication, tip attribution and rule permissions.
- Local real-backend browser verified 10% on 470.01 rubles = 47 rubles; custom 100.01 persists, and mobile tip controls fit 390px without horizontal overflow. General cards show server-calculated history and configured thresholds. Production mutations are not used for test transactions.
- Published tips/general release `d61228f809154c3b6457af18331c15b03f7c07e8`; CI passed: https://github.com/WizardJIOCb/vietnam/actions/runs/36700948208. Backup `/var/backups/food-sinchao/food-sinchao-20260930-131315.sql.gz`; migration 008 applied. Existing visits/shares retain zero tips. Health OK, active/running, NRestarts=0; public JS/CSS hashes match local. Live profile confirms four general tracks and 50% radius/hidden overflow for dish badge images.

## Illustrated Food Journey — 2026-09-30

- Generated eight matching pho-bowl mascots with built-in image_gen: four Food Journey milestones and four general achievement tracks. Food Journey milestone cards are retained alongside the new general tracks; progress remains server calculated.
- Original selected PNGs are saved locally under artifacts/achievement-originals. Eight 512px WebP website assets total 419,304 bytes, lazy-loaded and clipped to circles. Prompts and mapping are documented in docs/ACHIEVEMENT_ART.md.
- Production build passes. Local browser confirms all eight assets load, circular geometry and no desktop overflow.
- Published artwork release `420e88c115a045c65ae045f6e805ec112b8955be`; CI passed https://github.com/WizardJIOCb/vietnam/actions/runs/36702022714. Backup `/var/backups/food-sinchao/food-sinchao-20260930-132403.sql.gz`. Service active/running, NRestarts=0; all eight public images and JS/CSS match local SHA256. Live browser confirms eight loaded circular illustrations, no console errors or overflow, including 390px. Screenshots: `artifacts/journey-art-live-desktop.png`, `artifacts/journey-art-live-mobile.png`.

## Menu editor visibility — 2026-09-30

- Reproduced all three menu buttons opening an editor below the entire dish list (textarea top 5424px at a 720px viewport), so no immediate change was visible.
- Edit dish, Categories and Add dish now open a named native modal dialog with initial textarea focus, scroll lock, close/Escape and responsive height. Invalid JSON and server validation errors stay inside the editor; successful saves close it and refresh the menu.
- Production build and 47 isolated tests pass. Local real-backend browser changed a dish name, changed a category name and created a dish; all persisted after reopening/reload. Malformed JSON shows an inline error and preserves the open editor. No production menu records were changed during verification.
