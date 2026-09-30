# Registration gift promotions

Migration 011 creates `APP200`: a fixed 200 RUB discount, enabled for new
registrations from the installed mobile PWA. Existing accounts receive no grant.
Administrators/managers manage it under **Промокоды и ачивки → Промокоды**.
The amount is entered in rubles and stored in kopecks. Only one promotion may
have **Выдавать при регистрации в мобильном приложении** selected at a time.

## Eligibility and redemption

- The client identifies installed mobile use from standalone/fullscreen display
  mode (including iOS standalone), user agent and iPad touch capability. Ordinary
  mobile/desktop browser registration and subsequent logins do not issue a gift.
- `registrationSource` is a client signal, not native-app attestation or proof
  of one physical person. A custom API client can claim this source; separate
  newly registered accounts can each receive a grant. There is no phone/SMS or
  device uniqueness check.
- User creation, personal grant and notification are atomic. The code is shared,
  but the server checks a per-user grant before quoting and ordering. A copied
  code does not make another account eligible.
- One grant can be redeemed for one order, including dine-in orders. It is
  consumed when the order is created, even if that order is later cancelled.
  Transactional locks prevent double use across sessions; idempotent retries do
  not consume it again. Quotes alone do not consume grants.
- The fixed discount is capped at eligible dish/modifier value; delivery and
  tips are excluded. Existing minimum-cart/dish/date/global-limit rules apply.
  Loyalty and tips use the discounted dish amount.

## Administration and customer display

The profile and cart show current issued gifts. The cart offers **Применить
подарок**, which runs the existing server quote. Registration also shows a toast
and creates an in-app notification. No email or push delivery is required.

Editing the amount changes all unused grants. Clearing the registration checkbox
stops future issuance, while existing grants remain personal and redeemable.
Disabling the promotion also blocks existing grants. `requiresGrant` is a
server-managed permanent flag, so clearing the checkbox cannot accidentally
turn a previously personal code into a public coupon. Global usage limits count
orders, not grants; a granted code may become unavailable when that limit is met.

## Verification

`tests/welcome-promotions.test.ts` covers source classification, atomic grant
issuance, duplicate registration, account isolation, unauthorized admin access,
fixed-discount cap and updated amounts, disabled/changed issuance, simultaneous
orders, idempotent retries and dine-in redemption. Browser QA uses isolated
accounts for profile/cart/admin views. Physical installed Android/iOS registration
has not been exercised end to end by automated browser QA.
