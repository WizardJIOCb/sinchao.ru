import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { app } from "../server/app";
import { pool } from "../server/db";
import { priceCart } from "../server/modules/pricing";
import { tipSchema } from "../server/validation";
import { calculateTip, splitTip } from "../shared/tips";
import { menu, categories, restaurant } from "./fixtures/demo-catalog";

if (
  !new URL(process.env.DATABASE_URL ?? "http://invalid").pathname.endsWith(
    "_test",
  )
)
  throw Error("Isolated _test database required");
let server: ReturnType<typeof app.listen>, base: string;
class Client {
  cookie = "";
  id = "";
  async call(path: string, method = "GET", body?: unknown, key?: string) {
    const r = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Cookie: this.cookie,
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const c = r.headers.getSetCookie().at(-1);
    if (c) this.cookie = c.split(";")[0];
    return { status: r.status, ...(await r.json()) };
  }
  async register(name: string) {
    const r = await this.call("/auth/register", "POST", {
      name,
      email: name + "@tips.test",
      password: "isolated-test-password",
      phone: "+79000000000",
    });
    assert.equal(r.status, 201);
    this.id = r.data.id;
  }
}
const admin = new Client(),
  alice = new Client(),
  bob = new Client(),
  stranger = new Client();
const dish = { ...menu[0], modifiers: [], price: 35001 };
const add = async (c: Client) =>
  assert.equal(
    (
      await c.call("/cart/items", "POST", {
        dishId: dish.id,
        quantity: 1,
        modifiers: [],
      })
    ).status,
    200,
  );
const code = "AABBCCDDEEFF112233445566";
before(async () => {
  await pool.query(
    "TRUNCATE audit_logs,notifications,loyalty_transactions,reservations,orders,sessions,users,analytics,qr_tables,restaurant_events,promotions,dish_achievement_rules,general_achievement_rules RESTART IDENTITY CASCADE",
  );
  await pool.query("DELETE FROM dishes");
  await pool.query("DELETE FROM categories");
  for (const [i, c] of categories.entries())
    await pool.query(
      "INSERT INTO categories(id,data,position) VALUES($1,$2,$3)",
      [c.id, JSON.stringify(c), i],
    );
  await pool.query("INSERT INTO dishes(id,data,position) VALUES($1,$2,0)", [
    dish.id,
    JSON.stringify(dish),
  ]);
  const offset = new Date().getUTCHours() - 12;
  await pool.query("UPDATE restaurant SET data=$1 WHERE id=1", [
    JSON.stringify({
      ...restaurant,
      timezone: `Etc/GMT${offset >= 0 ? "+" : "-"}${Math.abs(offset)}`,
      openHour: 0,
      closeHour: 24,
      leadMinutes: 10,
    }),
  ]);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as any).port}/api`;
  await admin.register("admin");
  await alice.register("alice");
  await bob.register("bob");
  await pool.query("UPDATE users SET role='ADMIN' WHERE id=$1", [admin.id]);
  await pool.query(
    "INSERT INTO gift_certificates(id,buyer_id,code,amount,balance,status,idempotency_key,expires_at) VALUES($1,$2,$3,500000,500000,'ACTIVE',$4,now()+interval '1 year')",
    [randomUUID(), alice.id, code, randomUUID()],
  );
});
after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await pool.end();
});

test("tip math excludes delivery, promo and points; split preserves each kopeck", () => {
  const q = priceCart(
    [
      {
        id: randomUUID(),
        dishId: dish.id,
        quantity: 1,
        modifiers: [],
        notes: "",
      },
    ],
    [dish],
    {
      ...restaurant,
      promo: { enabled: true, code: "TEST", percent: 20 },
      zones: [{ ...restaurant.zones[0], fee: 1234, minimum: 0 }],
    },
    {
      fulfillment: "DELIVERY",
      zoneId: restaurant.zones[0].id,
      promo: "TEST",
      points: 20,
      tip: { kind: "percent", value: 10 },
    },
    20,
  );
  assert.equal(q.tip, 2600);
  assert.equal(q.total, 35001 - 7000 - 2000 + 1234 + 2600);
  assert.equal(calculateTip(0, { kind: "amount", value: 10000 }), 0);
  assert.equal(calculateTip(12345, { kind: "amount", value: 321 }), 321);
  for (const amount of [0, 1, 2, 3501, 10001])
    for (const count of [1, 2, 3, 20])
      assert.equal(
        splitTip(amount, count).reduce((a, b) => a + b, 0),
        amount,
      );
  for (const choice of [
    { kind: "percent", value: -1 },
    { kind: "percent", value: 31 },
    { kind: "amount", value: 1.5 },
    { kind: "amount", value: 500001 },
    { kind: "none", value: 1 },
  ])
    assert.equal(tipSchema.safeParse(choice).success, false);
});

test("checkout persists tip once, excludes it from gift redemption and loyalty", async () => {
  await add(alice);
  const input = {
    fulfillment: "PICKUP",
    name: "Тест",
    phone: "+79000000000",
    time: "ASAP",
    tip: { kind: "percent", value: 10 },
  };
  const quote = await alice.call("/cart/quote", "POST", input);
  assert.equal(quote.data.tip, 3500);
  assert.equal(quote.data.total, 38501);
  assert.equal(
    (
      await alice.call("/cart/quote", "POST", {
        ...input,
        tip: { kind: "percent", value: 101 },
      })
    ).status,
    400,
  );
  const key = randomUUID();
  const order = await alice.call("/orders", "POST", input, key);
  assert.equal(order.status, 201);
  assert.equal(order.data.tip, 3500);
  assert.equal(
    (await alice.call("/orders", "POST", input, key)).data.id,
    order.data.id,
  );
  assert.equal(
    (
      await alice.call(
        "/orders",
        "POST",
        { ...input, tip: { kind: "amount", value: 5000 } },
        key,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await admin.call(
        "/admin/v2/gifts/redeem",
        "POST",
        { code, orderId: order.data.id, amount: 38501 },
        randomUUID(),
      )
    ).error.code,
    "GIFT_AMOUNT",
  );
  assert.equal(
    (
      await admin.call(
        "/admin/v2/gifts/redeem",
        "POST",
        { code, orderId: order.data.id, amount: 35001 },
        randomUUID(),
      )
    ).status,
    200,
  );
  assert.equal(
    (await alice.call(`/orders/${order.data.id}`)).data.paymentStatus,
    "PENDING",
  );
  await admin.call(`/admin/orders/${order.data.id}/payment`, "POST", {});
  for (const status of ["CONFIRMED", "PREPARING", "READY", "COMPLETED"])
    assert.equal(
      (
        await admin.call(`/admin/orders/${order.data.id}/status`, "PATCH", {
          status,
        })
      ).status,
      200,
    );
  const earned = (
    await pool.query(
      "SELECT points FROM loyalty_transactions WHERE reference_id=$1 AND type='EARN'",
      [order.data.id],
    )
  ).rows[0].points;
  assert.equal(
    earned,
    Math.floor(((35001 / 100) * restaurant.loyaltyPercent) / 100),
  );
});

test("shared table tips: membership, stale writes, exact split, gift exclusion, settlement and closed bill", async () => {
  const tableId = randomUUID();
  await pool.query(
    "INSERT INTO qr_tables(id,token,name,seats,zone,shape,x,y) VALUES($1,'tips-qr','Тест чаевых',4,'Зал','square',15,15)",
    [tableId],
  );
  const opened = await admin.call("/admin/v2/visits", "POST", { tableId });
  assert.equal(opened.status, 201);
  const id = opened.data.id;
  for (const c of [alice, bob])
    assert.equal(
      (
        await c.call("/v2/visits/join", "POST", {
          token: "tips-qr",
          code: opened.data.joinCode,
        })
      ).status,
      200,
    );
  const tip = (c: Client, value: number, version: number, kind = "percent") =>
    c.call(`/v2/visits/${id}/tip`, "PUT", {
      choice: { kind, value },
      expectedVersion: version,
    });
  assert.equal((await tip(stranger, 10, 0)).status, 404);
  assert.equal((await tip(alice, 10, 0)).status, 200);
  await add(alice);
  const order = await alice.call(
    `/v2/visits/${id}/orders`,
    "POST",
    {},
    randomUUID(),
  );
  assert.equal(order.status, 201);
  let v = (await alice.call(`/v2/visits/${id}`)).data;
  assert.equal(v.tip, 3500);
  assert.equal(v.foodTotal, 35001);
  assert.equal(v.total, 38501);
  assert.equal((await tip(bob, 15, 0)).status, 409);
  await add(alice);
  const secondOrder = await alice.call(`/v2/visits/${id}/orders`, "POST", {}, randomUUID());
  assert.equal(secondOrder.status, 201);
  assert.equal((await alice.call(`/v2/visits/${id}`)).data.tip, 7000);
  const concurrent = await Promise.all([
    tip(alice, 10001, 1, "amount"),
    tip(bob, 10001, 1, "amount"),
  ]);
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (await alice.call(`/v2/visits/${id}/split`, "POST", { count: 3 })).status,
    200,
  );
  v = (await alice.call(`/v2/visits/${id}`)).data;
  assert.equal(v.tip, 10001);
  assert.equal(v.total, 80003);
  assert.equal(
    v.shares.reduce((n: number, s: any) => n + s.amount, 0),
    v.total,
  );
  assert.equal(
    v.shares.reduce((n: number, s: any) => n + s.tip, 0),
    v.tip,
  );
  assert.equal((await tip(alice, 0, 2, "none")).status, 409);
  const share = v.shares[0];
  assert.equal(
    (
      await admin.call(
        "/admin/v2/gifts/redeem",
        "POST",
        { code, shareId: share.id, amount: share.amount },
        randomUUID(),
      )
    ).error.code,
    "GIFT_AMOUNT",
  );
  assert.equal(
    (
      await admin.call(
        "/admin/v2/gifts/redeem",
        "POST",
        { code, shareId: share.id, amount: share.amount - share.tip },
        randomUUID(),
      )
    ).status,
    200,
  );
  assert.equal(
    (await admin.call(`/admin/v2/visits/${id}/split`, "DELETE", {})).status,
    409,
  );
  for (const s of v.shares)
    assert.equal(
      (
        await admin.call(
          `/admin/v2/visits/${id}/shares/${s.id}/pay`,
          "POST",
          {},
        )
      ).status,
      200,
    );
  v = (await alice.call(`/v2/visits/${id}`)).data;
  assert.equal(v.paid, v.total);
  assert.equal(v.orders[0].paymentStatus, "PAID");
  for (const completedOrder of [order, secondOrder])
  for (const status of ["CONFIRMED", "PREPARING", "READY", "COMPLETED"])
    assert.equal(
      (
        await admin.call(`/admin/orders/${completedOrder.data.id}/status`, "PATCH", {
          status,
        })
      ).status,
      200,
    );
  assert.equal(
    (await admin.call(`/admin/v2/visits/${id}/close`, "POST", {})).status,
    200,
  );
  assert.equal((await tip(alice, 5, 2)).status, 409);
});

test("general achievements count settled bills once, attribute tips, count delivery and accept manager rules", async () => {
  const progress = async (c: Client) =>
    Object.fromEntries(
      (await c.call("/v2/discovery")).data.generalAchievements.map((a: any) => [
        a.id,
        a,
      ]),
    );
  let a = await progress(alice);
  assert.equal(a.bills.progress, 2);
  assert.equal(a.pickup.progress, 1);
  assert.equal(a.delivery.progress, 0);
  const tipper = (
    await pool.query(
      "SELECT tip_user_id FROM dine_visits WHERE status='CLOSED' AND tip_user_id IS NOT NULL",
    )
  ).rows[0].tip_user_id;
  assert.equal(a.tips.progress, tipper === alice.id ? 2 : 1);
  const b = await progress(bob);
  assert.equal(b.bills.progress, 0);
  assert.equal(b.tips.progress, tipper === bob.id ? 1 : 0);
  assert.ok(
    Object.values(await progress(stranger)).every((x: any) => x.progress === 0),
  );
  await add(alice);
  await add(alice);
  const delivery = await alice.call(
    "/orders",
    "POST",
    {
      fulfillment: "DELIVERY",
      zoneId: restaurant.zones[0].id,
      address: restaurant.zones[0].streets[0] + " дом 16",
      name: "Тест",
      phone: "+79000000000",
      time: "ASAP",
    },
    randomUUID(),
  );
  assert.equal(delivery.status, 201, JSON.stringify(delivery));
  assert.equal((await progress(alice)).delivery.progress, 0);
  await admin.call(`/admin/orders/${delivery.data.id}/payment`, "POST", {});
  for (const status of [
    "CONFIRMED",
    "PREPARING",
    "READY",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "COMPLETED",
  ])
    assert.equal(
      (
        await admin.call(`/admin/orders/${delivery.data.id}/status`, "PATCH", {
          status,
        })
      ).status,
      200,
    );
  a = await progress(alice);
  assert.equal(a.delivery.progress, 1);
  assert.equal(a.bills.progress, 3);
  assert.equal(a.delivery.level, 1);
  const rule = {
    id: "delivery",
    name: "Диванный гурман XL",
    enabled: true,
    milestones: [2, 4, 6, 8, 10],
  };
  assert.equal(
    (
      await alice.call(
        "/admin/marketing/general-achievements/delivery",
        "PUT",
        rule,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await admin.call(
        "/admin/marketing/general-achievements/delivery",
        "PUT",
        { ...rule, milestones: [2, 1, 6, 8, 10] },
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await admin.call(
        "/admin/marketing/general-achievements/delivery",
        "PUT",
        rule,
      )
    ).status,
    200,
  );
  a = await progress(alice);
  assert.equal(a.delivery.level, 0);
  assert.equal(a.delivery.name, rule.name);
  await admin.call("/admin/marketing/general-achievements/delivery", "PUT", {
    ...rule,
    enabled: false,
  });
  assert.equal((await progress(alice)).delivery, undefined);
  await admin.call(
    "/admin/marketing/general-achievements/delivery",
    "PUT",
    rule,
  );
});
