# Android installation

The restaurant site is a PWA at https://food.xedoc.ru. Open it in Chrome on Android, then tap the phone icon in the header. When Chrome provides an installation prompt, the button opens it. Otherwise, it shows instructions to use Chrome's menu → Install app / Add to Home screen. Menu wording depends on the browser. Installation is confirmed by the user on their phone.

The app uses the restaurant's original logo, launches at `/` in a standalone window, and updates its live content from the same website. Browser support determines whether Android installs a WebAPK or a home-screen shortcut. In standalone mode the installation button is hidden. App shortcuts link to Menu and Discover.

The service worker caches only a separate public offline screen, its CSS/JS, and one logo icon. API responses, account data, cart, orders, reservations and live HTML are never written to Cache Storage. If a page cannot reach the network, the fallback offers a retry and the restaurant's phone number. Placing an order or making a reservation requires connectivity; nothing is queued in the background. Existing website cart persistence is unchanged.

The worker registers only in the production build and a secure context. `/sw.js`, manifest and fallback assets revalidate rather than use the general one-hour HTTP cache. A new worker waits for existing tabs to close, avoiding forced reloads during checkout. When changing fallback assets, increment the cache version in `public/sw.js`.

Regenerate PNG icons from `public/images/vk-group/logo.jpg` on Windows with `powershell -File scripts/generate-pwa-icons.ps1`. The maskable icon keeps the full logo within Android's central safe area. Standard PNG sizes are 192/512; Apple touch icon is 180.

Run `node --import tsx --test tests/pwa.test.ts` and `npm run build`. Browser verification should check installation diagnostics, worker activation, mobile header/dialog, and a real navigation with Network offline enabled. Desktop checks do not prove Android installation; finish on the target phone.

An APK is optional. If a distributable package or Play listing is needed, wrap this deployed PWA in a Trusted Web Activity using Bubblewrap, sign it, and deploy `/.well-known/assetlinks.json` with the package name and signing-certificate SHA256. Keep the signing key private and preserve it for updates. Publishing to a store is a separate action. No APK or store listing is produced by this PWA change.

References: [Chrome installation criteria](https://web.dev/articles/install-criteria), [PWA installation](https://web.dev/learn/pwa/installation), [Trusted Web Activity quick start](https://developer.chrome.com/docs/android/trusted-web-activity/quick-start).
