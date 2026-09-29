# 01-SDD.md

# Software Design Document
## Vietnamese Restaurant App

**Version:** 1.0  
**Scope:** V1 + V2  
**Status:** Implementation baseline for Codex

---

# 1. Purpose

This document defines the technical baseline for a Vietnamese restaurant customer platform.

The system must support:

- delivery;
- pickup;
- reservations;
- dine-in QR ordering;
- payments;
- loyalty;
- reorder;
- V2 table selection;
- V2 reservation pre-order;
- V2 split bill;
- V2 personalization;
- V2 Vietnamese Food Journey.

The architecture must support V2 without requiring a rewrite of V1.

---

# 2. Core Architecture Principle

Use a modular monolith unless the existing repository already requires another architecture.

Do not introduce microservices in MVP.

Recommended logical modules:

```text
auth
users
menu
cart
orders
delivery
pickup
payments
reservations
tables
dineIn
loyalty
notifications
recommendations
foodJourney
events
admin
analytics
```

Modules may live in one backend application but must have clear boundaries.

---

# 3. System Components

```text
Customer Web/App
       |
       v
API / Backend
       |
       +-- Auth
       +-- Menu
       +-- Cart
       +-- Orders
       +-- Reservations
       +-- Loyalty
       +-- Notifications
       |
       +-- Payment Provider
       +-- Delivery Provider / Restaurant Dispatch
       +-- Database
```

V2:

```text
QR
 |
 v
Dine-in Session
 |
 +-- Table
 +-- Active Order
 +-- Kitchen
 +-- Payment
```

---

# 4. Recommended Technology

If the existing project already has an established stack, preserve it.

Otherwise recommended:

### Frontend
- React
- TypeScript
- responsive mobile-first UI
- TanStack Query or equivalent server-state library

### Backend
- Node.js
- TypeScript
- REST API initially

### Database
- PostgreSQL

### ORM
- Drizzle ORM or existing project ORM

### Validation
- Zod or equivalent

### Authentication
- session/JWT architecture appropriate to existing application

### Payments
- provider abstraction; never hardcode a single payment provider into domain logic

### Notifications
- push + in-app notification abstraction

---

# 5. Repository Structure

Recommended:

```text
/
├── docs/
│   ├── 00-PRODUCT_PRINCIPLES.md
│   └── 01-SDD.md
│
├── apps/
│   ├── customer/
│   └── admin/
│
├── server/
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── menu/
│   │   ├── orders/
│   │   ├── reservations/
│   │   ├── tables/
│   │   ├── loyalty/
│   │   ├── notifications/
│   │   └── analytics/
│   └── shared/
│
├── packages/
│   ├── types/
│   ├── validation/
│   └── config/
│
└── README.md
```

If the repository has an existing structure, adapt instead of duplicating architecture.

---

# 6. Domain Model

## User

```text
id
email
phone
name
role
createdAt
updatedAt
```

Roles:

- CUSTOMER
- STAFF
- MANAGER
- ADMIN

---

## Address

```text
id
userId
label
street
building
unit
city
postalCode
country
latitude
longitude
isDefault
createdAt
updatedAt
```

Do not store unnecessary location data.

---

## Category

```text
id
name
slug
description
image
sortOrder
isActive
```

---

## Dish

```text
id
categoryId
name
localizedName
slug
description
ingredients
image
basePrice
currency
spiceLevel
isAvailable
isActive
sortOrder
createdAt
updatedAt
```

---

## ModifierGroup

```text
id
name
minSelections
maxSelections
required
sortOrder
```

---

## Modifier

```text
id
groupId
name
priceDelta
isAvailable
sortOrder
```

---

## Allergen

```text
id
code
name
```

Dish-to-allergen relation:

```text
dishId
allergenId
```

---

## DietaryTag

```text
id
code
name
```

Dish-to-tag relation:

```text
dishId
tagId
```

---

# 7. Cart

Cart is temporary and belongs to a customer/session.

```text
Cart
- id
- userId/sessionId
- fulfillmentType
- restaurantId
- createdAt
- updatedAt
```

Cart item:

```text
CartItem
- id
- cartId
- dishId
- quantity
- unitPriceSnapshot
- modifiersSnapshot
- notes
```

Prices must be revalidated by backend during checkout.

---

# 8. Fulfillment Types

Enum:

```text
DELIVERY
PICKUP
DINE_IN
```

Do not create separate order systems for each.

Use one Order domain with fulfillment-specific data.

---

# 9. Order

```text
Order
- id
- orderNumber
- userId
- fulfillmentType
- status
- subtotal
- discountTotal
- loyaltyDiscount
- deliveryFee
- serviceFee
- taxTotal
- grandTotal
- currency
- addressId nullable
- pickupTime nullable
- reservationId nullable
- tableId nullable
- paymentStatus
- createdAt
- updatedAt
```

---

# 10. Order Item

```text
OrderItem
- id
- orderId
- dishId
- dishNameSnapshot
- quantity
- unitPrice
- modifiersSnapshot
- lineTotal
- notes
```

Snapshot names and prices at purchase time.

Do not depend on current menu records to render historical orders.

---

# 11. Order State Machine

```text
CREATED
  |
PAYMENT_PENDING
  |
PAID
  |
CONFIRMED
  |
PREPARING
  |
READY
  |
OUT_FOR_DELIVERY
  |
DELIVERED
  |
COMPLETED
```

Valid variants:

Pickup:

```text
PAID → CONFIRMED → PREPARING → READY → COMPLETED
```

Dine-in:

```text
PAID → CONFIRMED → PREPARING → SERVED → COMPLETED
```

Cancelled:

```text
CREATED/PAYMENT_PENDING/CONFIRMED → CANCELLED
```

Backend must reject invalid state transitions.

---

# 12. Payment

Create provider abstraction:

```text
PaymentProvider
- createPayment()
- confirmPayment()
- refundPayment()
- getPaymentStatus()
```

Domain model:

```text
Payment
- id
- orderId
- provider
- providerPaymentId
- amount
- currency
- status
- createdAt
- updatedAt
```

Payment statuses:

```text
PENDING
AUTHORIZED
PAID
FAILED
REFUNDED
PARTIALLY_REFUNDED
```

Never store raw card details.

---

# 13. Delivery

Delivery domain:

```text
Delivery
- id
- orderId
- addressId
- fee
- estimatedMinutes
- status
- courierName nullable
- trackingReference nullable
- createdAt
- updatedAt
```

Possible states:

```text
PENDING
ASSIGNED
PICKED_UP
IN_TRANSIT
DELIVERED
FAILED
CANCELLED
```

Use an abstraction for external delivery providers.

---

# 14. Pickup

```text
Pickup
- id
- orderId
- pickupTime
- status
```

Status:

```text
SCHEDULED
PREPARING
READY
COLLECTED
CANCELLED
```

---

# 15. Reservations

```text
Reservation
- id
- userId
- date
- startTime
- endTime
- partySize
- seatingPreference
- notes
- status
- tableId nullable
- preOrderId nullable
- createdAt
- updatedAt
```

Statuses:

```text
PENDING
CONFIRMED
SEATED
COMPLETED
CANCELLED
NO_SHOW
```

V1 may leave `tableId` null.

---

# 16. Reservation Availability

Backend must calculate availability.

Inputs:

```text
date
time
partySize
seatingPreference
```

Rules may include:

- opening hours;
- closed periods;
- table capacity;
- reservation duration;
- buffer time;
- booking horizon;
- minimum/maximum party size;
- blackout dates.

Never calculate reservation availability solely in frontend.

---

# 17. Tables — V2

```text
Table
- id
- name
- capacity
- area
- positionX
- positionY
- shape
- status
- features
```

Features may include:

```text
WINDOW
QUIET
FAMILY
ACCESSIBLE
BAR
OUTDOOR
```

V2 floor plan:

```text
Restaurant
  └── Area
       └── Table
```

Specific table selection must still be validated by backend.

---

# 18. Reservation → Pre-order — V2

A reservation may optionally reference an order:

```text
Reservation.preOrderId
```

Pre-order lifecycle:

```text
CREATED
→ CONFIRMED
→ RELEASED_TO_KITCHEN
→ SERVED
```

Do not send a pre-order to kitchen immediately when it is created.

It must be scheduled according to restaurant rules.

---

# 19. Dine-in QR — V2

Each table receives a QR token.

Example conceptual URL:

```text
/dine-in/{restaurantId}/{tableToken}
```

Never expose raw database table IDs if avoidable.

Backend resolves:

```text
QR token
→ restaurant
→ table
→ active dining session
```

---

# 20. Dining Session

```text
DiningSession
- id
- tableId
- openedAt
- closedAt nullable
- status
```

Statuses:

```text
OPEN
PAYMENT_PENDING
CLOSED
```

The active dining session can contain multiple order additions.

---

# 21. QR Ordering Flow

```text
Scan QR
   ↓
Resolve table
   ↓
Show menu
   ↓
Add items
   ↓
Create dine-in order
   ↓
Kitchen receives order
   ↓
Prepare
   ↓
Serve
   ↓
Add more items OR pay
```

The QR flow must not create a second table/session accidentally if one is already active.

---

# 22. Split Bill — V2

The order system must eventually support:

- full payment;
- partial payment;
- item-based split;
- equal split.

Recommended domain:

```text
OrderPayment
- id
- orderId
- payerUserId nullable
- amount
- status
```

The backend must guarantee that total paid cannot exceed payable total.

---

# 23. Loyalty

## LoyaltyAccount

```text
id
userId
balance
lifetimeEarned
lifetimeRedeemed
createdAt
updatedAt
```

## LoyaltyTransaction

```text
id
accountId
type
points
referenceType
referenceId
description
createdAt
```

Types:

```text
EARN
REDEEM
ADJUSTMENT
EXPIRED
BONUS
REFUND
```

Do not modify balance without a transaction record.

---

# 24. Loyalty Rules

Rules must be configurable.

Example:

```text
order total → points
reservation completed → points
event participation → bonus
referral → bonus
```

V1 should keep the rules simple.

---

# 25. Notifications

Domain:

```text
Notification
- id
- userId
- type
- title
- body
- referenceType
- referenceId
- readAt
- createdAt
```

Notification types:

```text
ORDER_UPDATE
DELIVERY_UPDATE
PICKUP_READY
RESERVATION_CONFIRMATION
RESERVATION_REMINDER
LOYALTY_REWARD
PROMOTION
```

Transactional notifications must be separated from marketing preferences.

---

# 26. Recommendations — V2

Initial recommendation engine can be deterministic.

Inputs:

- order history;
- favorite dishes;
- dietary tags;
- spice preference;
- category preference;
- availability;
- popularity.

Do not start with a complex ML system.

Example:

```text
IF user ordered Bún Bò Huế
AND likes spicy dishes
THEN recommend another spicy noodle dish.
```

---

# 27. Food Journey — V2

Data model:

```text
FoodRegion
- id
- name
- description
```

```text
FoodJourneyDish
- id
- regionId
- dishId
- requiredForAchievement
```

```text
UserFoodJourney
- userId
- dishId
- firstTriedAt
- timesOrdered
```

Achievements:

```text
Achievement
- id
- code
- name
- description
- icon
```

User achievements:

```text
UserAchievement
- userId
- achievementId
- unlockedAt
```

---

# 28. Events — V2

```text
Event
- id
- title
- description
- image
- startAt
- endAt
- capacity
- price
- status
```

Optional reservation relation:

```text
EventBooking
- id
- eventId
- userId
- quantity
- status
```

---

# 29. Gift Certificates — V2

```text
GiftCertificate
- id
- code
- initialValue
- remainingValue
- currency
- purchaserUserId
- recipientEmail nullable
- expiresAt
- status
```

Codes must be unique and securely generated.

---

# 30. Referral — V2

```text
Referral
- id
- referrerUserId
- referredUserId
- status
- rewardIssued
- createdAt
```

Reward only after the referred customer completes the qualifying action.

---

# 31. API Principles

Use REST initially.

All API responses must use predictable structures.

Example:

```json
{
  "data": {},
  "error": null,
  "meta": {}
}
```

Errors:

```json
{
  "data": null,
  "error": {
    "code": "RESERVATION_UNAVAILABLE",
    "message": "Selected time is no longer available."
  },
  "meta": {}
}
```

Do not expose internal stack traces to clients.

---

# 32. Suggested API

## Auth

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/me
```

## Menu

```text
GET /api/menu
GET /api/categories
GET /api/dishes/:id
```

## Cart

```text
GET    /api/cart
POST   /api/cart/items
PATCH  /api/cart/items/:id
DELETE /api/cart/items/:id
DELETE /api/cart
```

## Orders

```text
POST /api/orders
GET  /api/orders
GET  /api/orders/:id
POST /api/orders/:id/reorder
POST /api/orders/:id/cancel
```

## Reservations

```text
GET  /api/reservations/availability
POST /api/reservations
GET  /api/reservations
GET  /api/reservations/:id
POST /api/reservations/:id/cancel
```

## Loyalty

```text
GET /api/loyalty
GET /api/loyalty/transactions
POST /api/loyalty/redeem
```

## QR

```text
GET /api/dine-in/:tableToken
POST /api/dine-in/:tableToken/orders
```

---

# 33. Validation

Validate at API boundary.

Examples:

- quantity > 0;
- partySize within configured range;
- reservation time within booking window;
- dish is available;
- modifiers are valid;
- modifier selection count is valid;
- delivery address is inside delivery zone;
- loyalty balance is sufficient;
- payment amount equals server-calculated total.

Never trust client-calculated totals.

---

# 34. Concurrency

Critical operations must be transaction-safe:

### Reservation

Prevent two customers from claiming the same capacity.

### Table selection

Prevent double booking.

### Loyalty

Prevent duplicate reward issuance.

### Payment

Use idempotency keys.

### Order creation

Use idempotency for payment/order creation requests.

---

# 35. Security

Minimum requirements:

- password hashing using established secure algorithm;
- secure session/token handling;
- authorization checks on every protected resource;
- rate limiting on auth and sensitive endpoints;
- server-side validation;
- payment provider tokens only;
- no raw card storage;
- signed/unguessable QR table tokens;
- audit logs for admin changes.

---

# 36. Admin Audit Log

Admin changes should be auditable.

```text
AuditLog
- id
- actorUserId
- action
- entityType
- entityId
- beforeSnapshot nullable
- afterSnapshot nullable
- createdAt
```

Important actions:

- price change;
- dish availability change;
- reservation change;
- order status override;
- loyalty adjustment.

---

# 37. Analytics Events

Analytics event structure:

```text
AnalyticsEvent
- id
- userId nullable
- sessionId
- eventName
- properties JSON
- createdAt
```

Keep analytics separate from core business state.

---

# 38. Error Handling

User-facing errors must be actionable.

Bad:

> Error 500.

Good:

> This time is no longer available. Please choose another time.

Use stable machine-readable error codes.

---

# 39. Offline / Network Failure

The customer UI must handle:

- temporary network loss;
- payment callback delay;
- stale menu data;
- stale reservation availability.

Never show a successful order until backend confirmation exists.

---

# 40. Idempotency

Required for:

- payment creation;
- order creation;
- reservation creation;
- loyalty reward issuance;
- gift certificate purchase.

The same request repeated because of network retry must not create duplicate business objects.

---

# 41. Testing Strategy

## Unit tests

Test:

- price calculation;
- modifiers;
- allergens;
- loyalty;
- reservation availability;
- order state transitions;
- delivery fee;
- reorder validation.

## Integration tests

Test:

- create order;
- pay;
- reservation;
- QR order;
- loyalty after completed order.

## E2E tests

Minimum flows:

### Delivery

`Menu → Cart → Checkout → Payment → Order status`

### Pickup

`Menu → Cart → Pickup → Payment → Ready`

### Reservation

`Book → Select date/time → Guests → Confirm`

### Reorder

`History → Repeat → Validate → Checkout`

### QR V2

`Scan → Table → Menu → Order → Pay`

---

# 42. Definition of Done — V1

V1 is complete when:

- customer can browse menu;
- customer can customize dish;
- backend calculates final price;
- delivery works;
- pickup works;
- payment works;
- order status works;
- order history works;
- reorder works;
- reservation works;
- cancellation works;
- notifications work;
- loyalty works;
- QR menu works;
- mobile UX is usable;
- critical flows have automated tests.

---

# 43. Definition of Done — V2

V2 is complete when:

- floor plan is available;
- table selection is backend validated;
- reservation can have pre-order;
- QR can create/add to dine-in order;
- active dining session is stable;
- waiter call works;
- split payment works;
- recommendations work;
- Food Journey works;
- achievements work;
- events work;
- gift certificates work;
- referral flow works.

---

# 44. Implementation Order

Codex should implement in this order.

## Phase 0 — Foundation

- inspect existing repository;
- preserve existing stack;
- establish environment;
- database;
- migrations;
- shared types;
- validation;
- error handling.

## Phase 1 — Menu

- categories;
- dishes;
- modifiers;
- allergens;
- dietary tags;
- availability.

## Phase 2 — Cart + Checkout

- cart;
- pricing;
- fulfillment;
- checkout;
- payment abstraction.

## Phase 3 — Orders

- order creation;
- state machine;
- history;
- reorder;
- notifications.

## Phase 4 — Delivery/Pickup

- delivery zones;
- fees;
- pickup slots;
- tracking abstraction.

## Phase 5 — Reservations

- availability;
- booking;
- cancellation;
- confirmation.

## Phase 6 — Loyalty + QR Menu

- loyalty;
- QR menu;
- analytics.

## Phase 7 — V2 Restaurant Experience

- tables;
- floor plan;
- specific table;
- pre-order;
- dine-in session;
- QR ordering;
- waiter call;
- split bill.

## Phase 8 — V2 Engagement

- recommendations;
- Food Journey;
- achievements;
- events;
- gift certificates;
- referrals.

---

# 45. Codex Working Rules

1. Read `00-PRODUCT_PRINCIPLES.md` before implementation.
2. Inspect the existing repository before creating architecture.
3. Do not rewrite working infrastructure without a documented reason.
4. Implement P0 before P1.
5. Keep business rules on the backend.
6. Keep restaurant configuration data-driven.
7. Do not hardcode prices or menu data in frontend.
8. Do not implement V2 prematurely while V1 is unstable.
9. Add tests for every critical state transition.
10. Use migrations for database changes.
11. Keep API contracts typed.
12. Prefer small modules over large generic files.
13. Document non-obvious business rules.
14. Do not add dependencies without justification.
15. When a requirement is ambiguous, choose the smallest implementation consistent with the Product Principles and document the assumption.

---

# 46. First Codex Task

Before writing application code:

1. Inspect repository.
2. Identify existing stack.
3. Identify existing database/schema.
4. Identify existing authentication.
5. Identify existing frontend routing/state management.
6. Produce a short architecture gap report.
7. Map current repository structure to this SDD.
8. Do not rewrite existing code yet.
9. Identify blockers.
10. Then begin Phase 0/Phase 1.

Expected first output:

```text
ARCHITECTURE_GAP_REPORT.md
```

The report must contain:

- existing stack;
- existing modules;
- reusable code;
- missing components;
- conflicts with SDD;
- proposed minimal changes;
- implementation order.

Only after this report should Codex begin substantial implementation.
