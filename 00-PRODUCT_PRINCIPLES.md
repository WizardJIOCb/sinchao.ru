# 00-PRODUCT_PRINCIPLES.md

# Vietnamese Restaurant App — Product Principles

**Document status:** Draft for implementation  
**Scope:** V1 + V2  
**Audience:** Codex, frontend/backend developers, product/design  
**Primary product:** Direct digital platform for one Vietnamese restaurant

---

## 1. Product Vision

The application is a digital extension of the Vietnamese restaurant.

It must connect three primary customer modes:

1. **Delivery** — order food to a chosen address.
2. **Pickup** — order ahead and collect at the restaurant.
3. **Dine-in** — reserve a table and later order/pay inside the restaurant.

The core customer journey is:

`Discover → Choose → Order/Reserve → Visit/Receive → Pay → Loyalty → Return`

The application is **not** a restaurant marketplace and must not evolve into one during V1/V2.

---

## 2. Product Positioning

The product should combine the strongest patterns observed in:

- Capichi — delivery + restaurant booking + loyalty.
- Savyu — booking + delivery + QR ordering.
- Ressto — delivery + pickup + dine-in + reservations.
- PHO24 — Vietnamese direct ordering.
- 123 Pho — ordering + pickup + rewards.
- Bambu Vietnamese — tracking + reorder + rewards.
- Vietnamese Foodies — ordering + loyalty + events/personalization.
- Roll'd Vietnamese — mobile ordering and pickup.

Do not copy competitor interfaces.

Use competitor functionality as evidence for expected user behavior, then create a simpler and more coherent experience.

---

# 3. Product Principles

## P1 — One restaurant, one account

The same customer account must work for:

- delivery;
- pickup;
- reservations;
- dine-in QR ordering;
- loyalty;
- order history;
- reservation history.

The customer should not need separate accounts for separate channels.

---

## P2 — Delivery is only one channel

The application must not feel like a delivery marketplace.

The primary modes are:

- Delivery;
- Pickup;
- Dine-in.

The Home screen should make these modes obvious.

Recommended primary actions:

- **Order delivery**
- **Order pickup**
- **Book a table**

When the user is physically in the restaurant, QR/Dine-in becomes the fastest path.

---

## P3 — Reservation and ordering must eventually connect

V1 supports independent table reservations.

V2 connects:

`Reservation → Table → Pre-order → Dine-in → Payment → Loyalty`

A reservation should become a reusable object in the customer's restaurant journey rather than a dead-end confirmation.

---

## P4 — QR ordering must be low friction

A customer scanning a table QR code must be able to see:

- restaurant;
- table;
- menu;
- current order;
- available dishes;
- modifiers;
- allergens;
- cart;
- payment/order state.

QR ordering should work without forcing an app installation.

Preferred fallback:

`QR → mobile web/PWA → optional account login`

If account creation is needed for loyalty, it should happen after the basic ordering path is available.

---

## P5 — Fast reorder

A returning customer must be able to repeat a previous order quickly.

The system must retain:

- previous items;
- modifiers;
- quantities;
- order totals;
- fulfillment type.

The customer must be warned if an item/modifier is no longer available.

---

## P6 — Vietnamese-first menu

The menu is not just a price list.

A dish may contain:

- Vietnamese name;
- localized display name;
- description;
- ingredients;
- portion information;
- taste profile;
- spice level;
- allergens;
- dietary tags;
- modifiers;
- availability;
- image.

The application should help users who are unfamiliar with Vietnamese cuisine.

---

## P7 — Structured allergens and dietary information

Allergen and dietary information must be structured data.

Do not rely only on free-form descriptions.

Examples:

- gluten;
- peanuts;
- sesame;
- soy;
- fish;
- shellfish;
- dairy;
- egg.

Dietary tags may include:

- vegetarian;
- vegan;
- gluten-free;
- spicy;
- mild.

The exact tags must be configurable by the restaurant.

---

## P8 — Transparent pricing

Before payment the customer must see:

- item subtotal;
- modifiers;
- discounts;
- loyalty redemption;
- delivery fee;
- service fee if applicable;
- tax if applicable;
- final total.

No unexpected fees should appear after payment confirmation.

---

## P9 — Transparent order state

The customer must always know what is happening.

Minimum order states:

`CREATED`
→ `PAYMENT_PENDING`
→ `PAID`
→ `CONFIRMED`
→ `PREPARING`
→ `READY`
→ `OUT_FOR_DELIVERY`
→ `DELIVERED`
→ `COMPLETED`

Pickup/dine-in may use a subset.

Every visible state must have a human-readable label.

---

## P10 — Reservation transparency

The customer must know:

- date;
- time;
- party size;
- seating preference;
- reservation status;
- cancellation rules;
- special notes if applicable.

V1 must not promise a specific table unless the backend can actually guarantee it.

---

## P11 — Loyalty must be useful, not intrusive

V1 loyalty:

- balance;
- earning;
- redemption;
- transaction history.

Loyalty must not complicate checkout.

V2 can add:

- achievements;
- Food Journey;
- referral bonuses;
- event rewards.

---

## P12 — Vietnamese Food Journey is optional discovery

Food Journey should encourage customers to discover dishes and Vietnamese regional cuisine.

Example:

### Northern Vietnam
- Phở Bò
- Bún Chả
- Bánh Cuốn

### Central Vietnam
- Bún Bò Huế
- Mì Quảng

### Southern Vietnam
- Cơm Tấm
- Hủ Tiếu

Food Journey must never block ordering.

---

## P13 — Personalization must be explainable

Recommendations may use:

- previous orders;
- favorite dishes;
- dietary preferences;
- spice preference;
- recently viewed items;
- popularity;
- availability.

Avoid opaque recommendations in V1.

V2 recommendations should explain themselves where practical:

> “Because you liked Bún Bò Huế…”

---

## P14 — Notifications must be useful

Transactional notifications:

- order accepted;
- order status changed;
- ready for pickup;
- courier update;
- reservation confirmed;
- reservation reminder;
- loyalty reward.

Marketing notifications require separate preference controls.

---

## P15 — Restaurant data is configurable

Do not hardcode restaurant data in frontend code.

The following must be data-driven:

- dishes;
- categories;
- prices;
- modifiers;
- allergens;
- dietary tags;
- opening hours;
- delivery zones;
- delivery fees;
- pickup settings;
- reservation rules;
- seating preferences;
- tables;
- loyalty rules;
- events.

---

## P16 — Backend is the source of truth

The frontend must not decide:

- final prices;
- order totals;
- availability;
- delivery fee;
- reservation availability;
- table availability;
- loyalty balance;
- order status.

These must be calculated/validated by backend services.

---

## P17 — Mobile-first

The primary customer experience is mobile.

Important flows must work well on small screens:

- menu;
- dish details;
- cart;
- checkout;
- tracking;
- reservation;
- QR ordering.

Desktop/web can be supported, but mobile is the primary design target.

---

## P18 — Accessibility

Important information must not rely on color alone.

Controls must have:

- readable labels;
- adequate touch targets;
- keyboard accessibility where applicable;
- meaningful error messages;
- alt text for meaningful images.

---

# 4. V1 Scope

## Account

- registration;
- login;
- guest mode;
- profile;
- logout.

## Menu

- categories;
- dish list;
- dish details;
- images;
- modifiers;
- allergens;
- dietary tags;
- availability.

## Cart and checkout

- cart;
- quantity editing;
- modifier editing;
- promo/discount support;
- loyalty redemption;
- delivery/pickup selection;
- address;
- time selection;
- payment;
- confirmation.

## Delivery

- delivery zones;
- delivery fee;
- delivery ETA;
- order status;
- tracking status;
- completion.

## Pickup

- pickup location;
- pickup time;
- order status;
- ready notification.

## Orders

- active order;
- history;
- order details;
- reorder.

## Reservations

- date;
- time;
- guests;
- seating preference;
- notes;
- confirmation;
- cancellation;
- reservation history.

## Loyalty

- balance;
- earning history;
- redemption;
- transaction history.

## QR Menu

- QR opens restaurant menu;
- table context when applicable;
- menu browsing;
- no forced app installation.

## Notifications

- transactional push/in-app notifications.

---

# 5. V2 Scope

## Restaurant experience

- visual floor plan;
- table availability;
- specific table selection;
- reservation-linked pre-order;
- QR dine-in ordering;
- add items to active table order;
- waiter call;
- split bill.

## Personalization

- customer preferences;
- personalized recommendations;
- “because you liked…” recommendations;
- favorite dishes.

## Vietnamese Food Journey

- regions;
- dishes;
- progress;
- discovery;
- achievements.

## CRM

- events;
- gift certificates;
- referrals.

---

# 6. V1/V2 Priorities

### P0 — required for V1

- menu;
- categories;
- dish details;
- modifiers;
- allergens;
- cart;
- delivery;
- pickup;
- checkout;
- payment;
- order status;
- order history;
- reorder;
- reservations;
- notifications;
- loyalty;
- QR menu.

### P1 — important V2

- floor plan;
- table selection;
- reservation pre-order;
- QR dine-in ordering;
- split bill;
- personalization;
- Food Journey;
- achievements.

### P2 — later

- advanced events;
- gift certificates;
- referrals;
- advanced personalization;
- advanced gamification.

---

# 7. Main Navigation

Recommended customer navigation:

1. Home
2. Menu
3. Orders
4. Reservations
5. Profile

Cart must be globally accessible.

Active order status must be visible without navigating through multiple screens.

---

# 8. Home Screen

Primary actions:

- Order delivery
- Order pickup
- Book a table

Secondary content:

- popular dishes;
- current promotions;
- loyalty balance;
- upcoming reservation;
- active order;
- optional personalized recommendations.

Do not overload the Home screen.

---

# 9. Reservation UX

## V1

Flow:

`Book → Date → Time → Guests → Seating preference → Notes → Confirm`

## V2

Flow:

`Book → Date → Time → Guests → Floor plan → Table → Pre-order → Confirm`

If no table is available, show alternatives instead of a generic error.

---

# 10. Order UX

Delivery:

`Menu → Dish → Modifiers → Cart → Delivery details → Payment → Tracking`

Pickup:

`Menu → Dish → Modifiers → Cart → Pickup time → Payment → Ready notification`

Dine-in V2:

`QR → Table → Menu → Cart → Order → Kitchen → Table`

---

# 11. Reorder UX

The order history should expose:

**Repeat order**

When clicked:

1. validate current availability;
2. validate current prices;
3. restore available items/modifiers;
4. flag unavailable items;
5. open cart for review.

Never silently restore outdated prices.

---

# 12. Admin Requirements

The restaurant must eventually be able to manage:

- menu;
- categories;
- dishes;
- prices;
- modifiers;
- allergens;
- availability;
- opening hours;
- delivery zones;
- delivery fees;
- pickup slots;
- reservations;
- tables;
- orders;
- loyalty rules;
- events.

Admin functionality may be implemented separately from customer UI, but backend models must support it from the beginning.

---

# 13. Analytics

Track at minimum:

- `app_open`
- `menu_view`
- `category_view`
- `dish_view`
- `add_to_cart`
- `remove_from_cart`
- `checkout_started`
- `payment_started`
- `payment_success`
- `payment_failed`
- `order_created`
- `order_completed`
- `reorder_clicked`
- `reservation_started`
- `reservation_created`
- `reservation_cancelled`
- `qr_opened`
- `dine_in_order_created`
- `loyalty_earned`
- `loyalty_redeemed`

Do not collect unnecessary personal data.

---

# 14. Non-Goals

Do not implement in V1/V2:

- marketplace of multiple restaurants;
- social network;
- public customer chat;
- own courier fleet management;
- complex AI assistant;
- complicated subscription system;
- advanced gamification unrelated to food discovery.

---

# 15. Definition of Success

## V1

A new user can:

1. browse the menu;
2. understand a dish;
3. customize it;
4. order delivery or pickup;
5. pay;
6. see order status;
7. book a table;
8. receive confirmation;
9. earn/use loyalty points.

A returning user can repeat a previous order quickly.

## V2

A restaurant visitor can:

1. reserve;
2. select a table;
3. optionally pre-order;
4. scan QR;
5. add to the table order;
6. request service;
7. split/pay;
8. receive loyalty rewards.

---

# 16. Guiding Question

Before implementing any feature ask:

> Does this make ordering, visiting the restaurant, or returning to the restaurant easier or more valuable?

If not, it needs explicit product justification before entering V1/V2.
