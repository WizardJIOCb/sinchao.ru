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
- Deployed `d769bc9cd4623478d92a8cb5e5475f42fa9a5840`; exact-commit CI passed https://github.com/WizardJIOCb/vietnam/actions/runs/36704047167. Backup `/var/backups/food-sinchao/food-sinchao-20260930-134357.sql.gz`. Public health OK, active/running, NRestarts=0, public JS/CSS hashes match the build. Live browser opened and closed all three actions: each dialog is visible at top 64px and focuses TEXTAREA. No console errors. Local 390px dialog has no horizontal overflow. Screenshot `artifacts/menu-editor-live-desktop.png`.

## Plain-language menu administration — 2026-09-30

- Replaced dish/create/category JSON editors with labelled forms and help text. Prices and option surcharges are entered in rubles and stored as integer kopecks. Existing IDs, crops, flags and modifier metadata are preserved; new IDs are generated without technical input. Dish fields cover descriptions, categories, portions, spice, availability, restaurant-only status, featured status, photo selection/URL/crop preview, modifiers, ingredients, allergens, tags and region.
- Categories have editable names/subtitles, add/remove and ordering controls. Used categories cannot be removed. Menu uses a semantic table with aligned columns/actions, responsive mobile rows, search across names/descriptions/ingredients/categories, category filter, count and empty state.
- Production build and all 47 existing isolated tests pass. Local browser edited real-shaped Tom Yam data to 399.90 rubles and an option to 100.25: DB verification confirmed 39990/10025 kopecks and exact preservation of every other field including crop and IDs. Created a new dish for 123.45 plus 10.50 surcharge with a gallery-selected crop; verified persisted values. Category rename/add/reorder survived reload and retained existing IDs. Search is case/spacing insensitive, zero results and category filters work. Mobile form/table at 390px have no horizontal overflow; desktop column boundaries match across rows.

## Dish features, modifier alignment and drink achievements — 2026-09-30

- Prior plain-language menu release `598d5b1` passed CI 36705986141 and was verified live: 56 real entries, search, labelled editors and responsive aligned table; production records unchanged by QA.
- Added selectable ingredient/dietary icons to dish cards, detail dialogs and recommendations. Existing composition suggests positive ingredient labels; explicit selections (including none) override suggestions. Vegetarian/vegan labels require tags or staff choice. Spice checkbox and existing spice level stay synchronized. API validates the feature enum; no schema migration needed.
- Modifier price input, availability checkbox and Remove now share the exact vertical center on desktop. On 390px, checkbox/Remove remain aligned in a separate action row; checkboxes render at 18px rather than inheriting 44px input minimum height.
- Added 12 drink achievements, separately grouped in profile and Food Journey, with editable names/visibility/five thresholds in marketing administration. Defaults: 1/3/5/10/20 qualifying orders, once per drink per order, historical orders included. Restaurant-only beer has a badge but online purchasing remains disabled; no manual/offline purchase import was added.
- All 58 isolated tests and build pass. Browser verified selecting/saving/removing dish icons with exact preservation of other dish fields, mobile fit, and all 12 drink names. No production data used for test purchases.
- Published release `bcf612c66a6b6bcf7a87583a981a80cad120225d`; exact-commit CI passed https://github.com/WizardJIOCb/vietnam/actions/runs/36708030039. Backup `/var/backups/food-sinchao/food-sinchao-20260930-142235.sql.gz`. Service active/running, NRestarts=0, public health OK; public JS/CSS SHA256 match local build. Concurrent PWA work through 6072291 was preserved.
- Live browser confirms 12 drink cards alongside 44 food tracks, ingredient chips in Tom Yam detail and all 12 admin feature choices. Modifier price/checkbox/Remove centers exactly match on desktop. Local 390px confirms aligned checkbox/Remove and no overflow; live 390px confirms 12 expanded drink cards without overflow. Local admin rename of the water achievement persisted and appeared in Food Journey. Screenshots: `artifacts/dish-features-live-editor.png`, `artifacts/modifier-actions-live.png`, `artifacts/drink-achievements-live.png`, `artifacts/drink-achievements-live-mobile.png`.

## Owner-requested achievement progress — 2026-09-30

- Migration 009 adds separate, user-scoped achievement grants. Gift steps add to food/drink badge progress without creating orders, payments, tips, loyalty transactions or Food Journey visits. Cards disclose gifted steps; regular completed orders continue to add progress.
- Added guarded idempotent maintenance grant for verified Rodion / rodion89@list.ru and Marat / rakisolo@gmail.com. Six tracks each: pho-bo, tom-yam, tea-pot, water, fruit-juice, soda-can. Requested gift totals: 26 and 22 steps. Grant key and audit events make the operation traceable and reversible.
- All 59 isolated tests and production build pass, including grant ownership, anonymous isolation, additive progress, no changes to ordinary activity/journey and duplicate protection. Rehearsed maintenance script twice against isolated accounts: exactly 12 grants / 48 steps, no duplicate accrual.

- Granted owner progress in release `79401a7fb609dd057829dc18fa986085a706dfb1`; CI 36709800745 passed; backup `/var/backups/food-sinchao/food-sinchao-20260930-144010.sql.gz`. Migration 009 applied. Exactly six grants per verified account; Rodion 26 steps, Marat 22. Server snapshot confirmed order counts and loyalty balances unchanged. Live Marat profile shows six awarded badges with disclosed gift progress. Rodion verified server-side using the same calculation.

## Image uploads, feature colours and photograph menu — 2026-09-30

- Managers/admins can upload JPG/PNG/WebP from their device (up to 10 MB input) in dish and achievement editors. Browser resizes/compresses before upload, server decodes/re-encodes and validates format/size. Stored WebP bytes are content-addressed in PostgreSQL (migration 010), so normal database backups and releases retain images. No original paths, EXIF, SVG or arbitrary file types are exposed. No Nginx body-limit change required.
- Achievement editors preview the round crop, support reverting to default, and apply only after Save. General and dish/drink badges display the chosen artwork. Dish uploads preserve aspect ratio and clear old menu-page crop; URL/gallery/crop controls remain available. Fixed oversized marketing checkboxes.
- Features now have twelve coordinated colours across cards, details and admin choices. Photo-menu entry is a prominent preview banner; 19 original pages are independent of dish photo edits. CSS viewport crops remove measured blank outer margins without changing source pixels or menu text. Gallery has an enlarged page reader with previous/next navigation and an original-image link.
- All 60 isolated tests and production build pass. API coverage: unauthorized/customer/staff denial, invalid/SVG/oversize rejection, duplicate reuse, public WebP dimensions, missing-image validation, general/dish artwork persistence and reset, menu image persistence. Local browser uploaded and saved a dish photo and general-achievement image through actual file inputs; dish DB record retained upload and cleared old crop.
- Local browser end-to-end: selected PNG through native file input for a dish, saved, and confirmed persisted URL plus cleared crop in DB. Uploaded general-achievement image, saved and saw it load in Food Journey. 19 cropped source pages and full-page reader work; 390px reader has no horizontal overflow. Seafood/mushroom tags have different computed colours. Original assets remain unchanged; cropped display is CSS-only.
- Published image/gallery release `843a22d` with migration 010; backup `/var/backups/food-sinchao/food-sinchao-20260930-145859.sql.gz`. Follow-up release `39f1c7c79cea4227d95e558748d69b25480b1240` improves enlarged-page focus/scroll; CI https://github.com/WizardJIOCb/vietnam/actions/runs/36712041099 passed all 60 tests and build. Final backup `/var/backups/food-sinchao/food-sinchao-20260930-150216.sql.gz`.
- Final live service active/running, NRestarts=0, health OK; public JS/CSS hashes match build. Live admin exposes upload inputs for menu and general achievements, preserves restaurant's custom achievement names, and uses 18px checkboxes. Local browser verified reset to standard artwork. Public gallery shows 19 pages with trimmed display margins; original files remain available. Desktop/mobile promo and reader screenshots are under `artifacts/photo-menu-*-live*.png`; upload forms under `artifacts/dish-image-upload-live.png` and `artifacts/achievement-image-upload-live.png`. Real production artwork was not changed for QA.

## Standalone dish photographs and photo-menu sharing — 2026-09-30

- Extracted 56 lossless WebP images at their original resolution with the existing plate/rounded masks. Manifest records source regions and hashes; original pages remain unchanged. Existing database migration changes only matching image fields, preserves staff data, and audits each replacement; custom uploads/crops are skipped. Last photo-menu page viewport excludes the remaining right white strip.
- Added `/menu/photos` with direct gallery opening, copy-link controls beside the banner and in the gallery, selectable-URL fallback, and Back/Forward handling. Dish images use contained sizing, preserving their full aspect ratio.
- All 62 isolated tests and build passed. Migration tests cover exact asset hashes/dimensions, preservation of other fields, staff replacement/crop/category guards and idempotence. Browser verified direct navigation, successful copy, closing/reopening, browser Back, individual dish image and 390px layout without horizontal overflow.
- Published release `491187f93d68384301ea79da99390dbebd9c1fba`; CI https://github.com/WizardJIOCb/vietnam/actions/runs/36714280510 passed. Backup `/var/backups/food-sinchao/food-sinchao-20260930-152348.sql.gz`. Service active/running, NRestarts=0, health OK.
- Live migration changed 56 images; repeat changed zero. Public API has 56 standalone image paths and zero imageCrop entries. Comparing before/after confirmed every other dish field unchanged. All 56 public WebP responses match manifest SHA-256; served JS/CSS match local build. Live browser confirms 56 product img elements, zero legacy product SVG crops, gallery direct link and successful clipboard action. Evidence: `artifacts/photo-menu-share-live.png`, `artifacts/photo-menu-last-trim-live.png`, `artifacts/extraction-photo-menu-mobile.png`, `artifacts/extraction-dish-local.png`.

## Prominent menu search — 2026-09-30

- Moved search above categories into a full-width, visibly labelled field with a 2px olive border, light surface, 24px icon, 60px touch target and 16px input text. Focus has an outer ring; native search clearing remains available. No search/filter logic or restaurant data changed.
- Build and exact-commit CI passed: https://github.com/WizardJIOCb/vietnam/actions/runs/36715693102 (62 existing tests). Browser checked name search (two pho-bo results), ingredient search (11 shrimp matches), empty results and restoring the full catalog. 390px and 320px layouts have no horizontal overflow.
- Deployed `03e862ef0426d69a27d5f80d5b33be876e570179`; backup `/var/backups/food-sinchao/food-sinchao-20260930-153635.sql.gz`. Service active/running, NRestarts=0, public health OK. Public JS/CSS match the local build exactly; live desktop search is labelled and 60px high. Screenshots: `artifacts/search-desktop-live.png`, `artifacts/search-mobile-live.png`.
