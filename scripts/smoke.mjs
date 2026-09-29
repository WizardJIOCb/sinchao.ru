// Public smoke test is deliberately restricted to an explicitly labelled demo.
import { randomUUID } from "node:crypto";
const origin = process.argv[2];
if (!origin?.startsWith("https://"))
  throw new Error("Pass the exact HTTPS deployment origin.");
let cookie = "";
async function call(path, method = "GET", body, key) {
  const r = await fetch(origin + "/api" + path, {
    method,
    headers: {
      Cookie: cookie,
      Origin: origin,
      "Content-Type": "application/json",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const c = r.headers.getSetCookie().at(-1);
  if (c) cookie = c.split(";")[0];
  const json = await r.json();
  if (!r.ok) throw new Error(path + ": " + JSON.stringify(json.error));
  return json.data;
}
const menu = await call("/menu");
if (!menu.config.demo)
  throw new Error("Refusing to create test records in live restaurant mode.");
let order, booking;
try {
  const dish = menu.dishes.find(
    (d) => d.available && d.modifiers.every((g) => g.min === 0),
  );
  await call("/cart/items", "POST", {
    dishId: dish.id,
    quantity: 2,
    modifiers: [],
    notes: "Автопроверка, не готовить",
  });
  const quote = await call("/cart/quote", "POST", {
    fulfillment: "PICKUP",
    zoneId: "",
    promo: "",
    points: 0,
  });
  const times = await call("/cart/times");
  if (!times.asap && !times.times.length)
    throw new Error(
      "No current fulfillment slots; run order smoke during configured opening hours.",
    );
  const key = randomUUID(),
    payload = {
      fulfillment: "PICKUP",
      zoneId: "",
      promo: "",
      points: 0,
      name: "Проверка HTTPS",
      phone: "+79000000000",
      address: "",
      time: times.asap ? "ASAP" : times.times[0],
      notes: "Автопроверка сайта, не готовить",
    };
  order = await call("/orders", "POST", payload, key);
  const retry = await call("/orders", "POST", payload, key);
  if (order.total !== quote.total || order.id !== retry.id)
    throw new Error("Quote/idempotency mismatch");
  const date = new Date(Date.parse(times.date + "T00:00:00Z") + 86400000)
    .toISOString()
    .slice(0, 10);
  const slots = await call(
    "/reservations/availability?date=" + date + "&partySize=2",
  );
  booking = await call(
    "/reservations",
    "POST",
    {
      date,
      time: slots.find((s) => s.available).time,
      partySize: 2,
      seating: menu.config.seating[0],
      name: "Проверка HTTPS",
      phone: "+79000000000",
      notes: "Автопроверка, не занимать стол",
    },
    randomUUID(),
  );
  console.log(
    JSON.stringify({
      health: (await call("/health")).status,
      orderNumber: order.number,
      total: order.total,
      idempotency: true,
      reservation: booking.id,
      notifications: (await call("/notifications")).length,
    }),
  );
} finally {
  if (order) await call("/orders/" + order.id + "/cancel", "POST", {});
  if (booking)
    await call("/reservations/" + booking.id + "/cancel", "POST", {});
  console.log("Created smoke records cancelled.");
}
