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

Menu content and images now come from the owner's supplied VK files. `menuVerified=true`; `demo=true` still identifies test ordering/booking because opening hours, delivery areas/fees, reservation capacity and loyalty rules require operator confirmation. Customer payment is pay-on-receipt; acquiring, SMS/push and couriers are not connected. V2 is not implemented.

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
