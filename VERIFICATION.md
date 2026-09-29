# Deployment acceptance — 2026-09-29

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

## Content and launch limitations

Real name, phone and address were provided by the user and installed. The requested VK group was blocked by the browser's safety policy. **The actual VK menu, prices and restaurant photographs have not been obtained or imported.** The catalogue, illustrations and business conditions remain explicitly labelled demo content. To complete content migration, provide menu text or images exported from that group.

Menu publication, opening hours, delivery areas/fees, reservation capacity and loyalty rules need real operator values before disabling demo mode. Customer payment is pay-on-receipt; card acquiring is not connected. Notifications are in-app; push/SMS and external couriers are not connected. V2 is not implemented. The deployment is a working V1 demonstration, not a complete V1+V2 launch.

No production staff account has been invented. The owner should register their own account and supply the email for authorized role assignment; no password sharing is needed.
