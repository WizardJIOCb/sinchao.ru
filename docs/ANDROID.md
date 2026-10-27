# Android installation

The restaurant site is a PWA at https://sinchao.ru. Open it in Chrome on Android, then tap the phone icon in the header. When Chrome provides an installation prompt, the button opens it. Otherwise, it shows instructions to use Chrome's menu → Install app / Add to Home screen. Menu wording depends on the browser. Installation is confirmed by the user on their phone.

The app uses the restaurant's original logo, launches at `/` in a standalone window, and updates its live content from the same website. Browser support determines whether Android installs a WebAPK or a home-screen shortcut. In standalone mode the installation button is hidden. App shortcuts link to Menu and Discover.

The service worker caches only a separate public offline screen, its CSS/JS, and one logo icon. API responses, account data, cart, orders, reservations and live HTML are never written to Cache Storage. If a page cannot reach the network, the fallback offers a retry and the restaurant's phone number. Placing an order or making a reservation requires connectivity; nothing is queued in the background. Existing website cart persistence is unchanged.

The worker registers only in the production build and a secure context. `/sw.js`, manifest and fallback assets revalidate rather than use the general one-hour HTTP cache. A new worker waits for existing tabs to close, avoiding forced reloads during checkout. When changing fallback assets, increment the cache version in `public/sw.js`.

Regenerate PNG icons from `public/images/vk-group/logo.jpg` on Windows with `powershell -File scripts/generate-pwa-icons.ps1`. The maskable icon keeps the full logo within Android's central safe area. Standard PNG sizes are 192/512; Apple touch icon is 180.

Run `node --import tsx --test tests/pwa.test.ts` and `npm run build`. Browser verification should check installation diagnostics, worker activation, mobile header/dialog, and a real navigation with Network offline enabled. Desktop checks do not prove Android installation; finish on the target phone.

An APK is optional. If a distributable package or Play listing is needed, wrap this deployed PWA in a Trusted Web Activity using Bubblewrap, sign it, and deploy `/.well-known/assetlinks.json` with the package name and signing-certificate SHA256. Keep the signing key private and preserve it for updates. Publishing to a store is a separate action. No APK or store listing is produced by this PWA change.

References: [Chrome installation criteria](https://web.dev/articles/install-criteria), [PWA installation](https://web.dev/learn/pwa/installation), [Trusted Web Activity quick start](https://developer.chrome.com/docs/android/trusted-web-activity/quick-start).

## Published verification — 2026-09-30

- Application commit/release: `60722911fd4deea33c85f8c73c50b16b740650a3`, `/opt/food-sinchao/releases/6072291`. Exact-commit [CI](https://github.com/WizardJIOCb/vietnam/actions/runs/36707350701) passed all 54 tests and the production build. Seven PWA tests cover icon contents/dimensions, API/write/external isolation, public precache resources, navigation with `cache: no-store`, fallback and cache cleanup.
- Backup: `/var/backups/food-sinchao/food-sinchao-20260930-141623.sql.gz`. Service is active/running with `NRestarts=0`; public health is OK. PWA deployment applied no migrations or catalogue changes. The preceding menu editor release is included.
- All 12 checked public files match the built files by SHA256, including HTML, manifest, worker, fallback, four icons, JS and CSS. Worker is JavaScript; manifest is `application/manifest+json`; both revalidate with `no-cache`. The versioned manifest URL prevents the old one-hour JPG manifest cache from blocking installation.
- Live Chrome `Page.getAppManifest` parses the new manifest without errors; `Page.getInstallabilityErrors` returns an empty array. Root service worker registration is activated. Existing tabs can keep the previous worker until they close; updates do not force reloads during a checkout.
- Live mobile button/help dialog verified at 390px; at 320px the header's controls fit (right edge 294px) and document width is 305px, without horizontal overflow. Screenshot: `C:/Projects/vietnam/artifacts/pwa-install-live-mobile.png`. Raw asset hashes: `artifacts/pwa-live-verification.json`.
- No Android device installation or APK build was performed. Desktop offline emulation did not reliably isolate worker network access; navigation fallback is verified by the worker tests, including a regression for an old React shell returned from HTTP cache. Confirm installation and offline launch on the target phone before describing them as device-tested.
