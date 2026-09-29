import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { app } from "../server/app";
import { pool } from "../server/db";
import { nextStates } from "../server/modules/orders";
import { priceCart } from "../server/modules/pricing";
import { config, dishes, localNow } from "../server/lib";
import type { Config, Dish } from "../shared/types";
if (
  !new URL(process.env.DATABASE_URL ?? "http://invalid").pathname.endsWith(
    "_test",
  )
)
  throw new Error("Tests require an isolated database ending in _test.");
let server: ReturnType<typeof app.listen>,
  base: string,
  cfg: Config,
  menu: Dish[];
class Client {
  cookie = "";
  async call(
    path: string,
    method = "GET",
    body?: unknown,
    key?: string,
    headers: Record<string, string> = {},
  ) {
    const r = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Cookie: this.cookie,
        ...(key ? { "Idempotency-Key": key } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const cookie = r.headers.getSetCookie().at(-1);
    if (cookie) this.cookie = cookie.split(";")[0];
    return {
      status: r.status,
      body: (await r.json()) as any,
      headers: r.headers,
    };
  }
}
before(async () => {
  await pool.query(
    "TRUNCATE audit_logs,notifications,loyalty_transactions,reservations,orders,sessions,users,analytics RESTART IDENTITY CASCADE",
  );
  cfg = await config(pool);
  cfg = {
    ...cfg,
    openHour: 0,
    closeHour: 24,
    leadMinutes: 10,
    capacity: 8,
    maxGuests: 8,
  };
  await pool.query("UPDATE restaurant SET data=$1 WHERE id=1", [
    JSON.stringify(cfg),
  ]);
  menu = await dishes(pool);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  base = "http://127.0.0.1:" + (server.address() as any).port + "/api";
});
after(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
  await pool.end();
});
const item = {
  dishId: "pho-bo",
  quantity: 2,
  modifiers: ["beef"],
  notes: "Тест",
};
const checkout = {
  fulfillment: "PICKUP",
  name: "Тестовый гость",
  phone: "+79000000000",
  time: "ASAP",
  points: 0,
  promo: "",
  zoneId: "",
  address: "",
  notes: "",
};
test("Server business rules and critical flows", async (t) => {
  const customer = new Client(),
    stranger = new Client(),
    staff = new Client();
  let order: any;
  await t.test(
    "menu is configurable and security headers are present",
    async () => {
      const r = await customer.call("/menu");
      assert.equal(r.status, 200);
      assert.equal(r.body.data.config.name, "Син Чао");
      assert.equal(r.body.data.dishes.length, 8);
      assert.ok(r.headers.get("content-security-policy"));
      assert.equal(r.headers.get("cache-control"), "no-store");
    },
  );
  await t.test(
    "prices include modifiers, promo, delivery and loyalty; client totals ignored",
    () => {
      const q = priceCart(
        [{ ...item, id: randomUUID() }],
        menu,
        cfg,
        {
          fulfillment: "DELIVERY",
          zoneId: "garden",
          promo: "XINCHAO10",
          points: 10,
        },
        100,
      );
      assert.equal(q.subtotal, 122000);
      assert.equal(q.discount, 12200);
      assert.equal(q.loyaltyDiscount, 1000);
      assert.equal(q.deliveryFee, 15000);
      assert.equal(q.total, 123800);
      assert.throws(() =>
        priceCart(
          [{ ...item, id: randomUUID(), modifiers: ["unknown"] }],
          menu,
          cfg,
          { fulfillment: "PICKUP", zoneId: "", promo: "", points: 0 },
          0,
        ),
      );
      assert.throws(() =>
        priceCart(
          [{ ...item, id: randomUUID(), modifiers: ["beef", "beef"] }],
          menu,
          cfg,
          { fulfillment: "PICKUP", zoneId: "", promo: "", points: 0 },
          0,
        ),
      );
      assert.throws(() =>
        priceCart(
          [{ ...item, id: randomUUID(), dishId: "coffee", modifiers: [] }],
          menu,
          cfg,
          { fulfillment: "PICKUP", zoneId: "", promo: "", points: 0 },
          0,
        ),
      );
    },
  );
  await t.test(
    "cross-site writes and anonymous administration rejected",
    async () => {
      assert.equal(
        (
          await stranger.call("/cart/items", "POST", item, undefined, {
            Origin: "https://evil.example",
          })
        ).status,
        403,
      );
      assert.equal((await stranger.call("/admin/dashboard")).status, 403);
    },
  );
  await t.test(
    "authentication, session rotation, admin authorization",
    async () => {
      const old = customer.cookie;
      const r = await customer.call("/auth/register", "POST", {
        name: "Тестовый клиент",
        email: "customer@example.test",
        password: "test-password-123",
      });
      assert.equal(r.status, 201);
      assert.notEqual(customer.cookie, old);
      assert.equal(
        (await customer.call("/me")).body.data.user.role,
        "CUSTOMER",
      );
      await staff.call("/auth/register", "POST", {
        name: "Сотрудник теста",
        email: "staff@example.test",
        password: "test-password-123",
      });
      await pool.query(
        "UPDATE users SET role='ADMIN' WHERE email='staff@example.test'",
      );
      assert.equal((await staff.call("/admin/dashboard")).status, 200);
      assert.equal((await customer.call("/admin/dashboard")).status, 403);
    },
  );
  await t.test("cart persists and invalid modifiers are rejected", async () => {
    assert.equal(
      (
        await customer.call("/cart/items", "POST", {
          ...item,
          modifiers: ["invalid"],
        })
      ).status,
      409,
    );
    assert.equal(
      (await customer.call("/cart/items", "POST", item)).status,
      200,
    );
    assert.equal((await customer.call("/cart")).body.data.length, 1);
    assert.equal(
      (
        await customer.call("/cart/quote", "POST", {
          fulfillment: "PICKUP",
          zoneId: "",
          promo: "",
          points: 0,
        })
      ).body.data.total,
      122000,
    );
  });
  await t.test(
    "delivery validates actual address and minimum, not just selected zone",
    async () => {
      const r = await customer.call(
        "/orders",
        "POST",
        {
          ...checkout,
          fulfillment: "DELIVERY",
          zoneId: "garden",
          address: "Другая улица 10",
        },
        randomUUID(),
      );
      assert.equal(r.status, 400);
      assert.equal(r.body.error.code, "OUTSIDE_ZONE");
      const q = await customer.call("/cart/quote", "POST", {
        fulfillment: "PICKUP",
        promo: "BAD",
        zoneId: "",
        points: 0,
      });
      assert.equal(q.status, 400);
    },
  );
  await t.test(
    "concurrent duplicate order creation is idempotent",
    async () => {
      const key = randomUUID();
      const replies = await Promise.all([
        customer.call("/orders", "POST", { ...checkout, total: 1 }, key),
        customer.call("/orders", "POST", { ...checkout, total: 1 }, key),
      ]);
      assert.equal(replies[0].status, 201);
      assert.equal(replies[1].status, 201);
      assert.equal(replies[0].body.data.id, replies[1].body.data.id);
      order = replies[0].body.data;
      assert.equal(order.total, 122000);
      assert.equal(order.paymentStatus, "PENDING");
      assert.equal((await customer.call("/cart")).body.data.length, 0);
      assert.equal(
        (
          await customer.call(
            "/orders",
            "POST",
            { ...checkout, name: "Другой клиент" },
            key,
          )
        ).status,
        409,
      );
    },
  );
  await t.test("order ownership enforced", async () => {
    assert.equal((await stranger.call("/orders/" + order.id)).status, 404);
    assert.equal(
      (await stranger.call("/orders/" + order.id + "/cancel", "POST", {}))
        .status,
      404,
    );
    assert.equal((await stranger.call("/orders")).body.data.length, 0);
  });
  await t.test("all allowed and rejected order transitions", () => {
    const states = [
      "CREATED",
      "CONFIRMED",
      "PREPARING",
      "READY",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "COMPLETED",
      "CANCELLED",
    ];
    for (const f of ["DELIVERY", "PICKUP"] as const) {
      for (const s of states) {
        assert.ok(!nextStates(s, f).includes(s));
        assert.ok(!nextStates(s, f).includes("CREATED"));
      }
      assert.deepEqual(nextStates("COMPLETED", f), []);
      assert.deepEqual(nextStates("CANCELLED", f), []);
    }
    assert.deepEqual(nextStates("READY", "DELIVERY"), ["OUT_FOR_DELIVERY"]);
    assert.deepEqual(nextStates("READY", "PICKUP"), ["COMPLETED"]);
  });
  await t.test(
    "staff processing requires payment; earns loyalty once",
    async () => {
      assert.equal((await staff.call("/orders/" + order.id)).status, 404);
      assert.equal(
        (
          await staff.call("/admin/orders/" + order.id + "/status", "PATCH", {
            status: "COMPLETED",
          })
        ).status,
        409,
      );
      for (const status of ["CONFIRMED", "PREPARING", "READY"])
        assert.equal(
          (
            await staff.call("/admin/orders/" + order.id + "/status", "PATCH", {
              status,
            })
          ).status,
          200,
        );
      assert.equal(
        (await customer.call("/orders/" + order.id + "/cancel", "POST", {}))
          .status,
        409,
      );
      assert.equal(
        (
          await staff.call("/admin/orders/" + order.id + "/status", "PATCH", {
            status: "COMPLETED",
          })
        ).status,
        409,
      );
      assert.equal(
        (await staff.call("/admin/orders/" + order.id + "/payment", "POST", {}))
          .status,
        200,
      );
      assert.equal(
        (await staff.call("/admin/orders/" + order.id + "/payment", "POST", {}))
          .status,
        200,
      );
      assert.equal(
        (
          await staff.call("/admin/orders/" + order.id + "/status", "PATCH", {
            status: "COMPLETED",
          })
        ).status,
        200,
      );
      assert.equal((await customer.call("/loyalty")).body.data.balance, 61);
      assert.equal(
        (
          await staff.call("/admin/orders/" + order.id + "/status", "PATCH", {
            status: "COMPLETED",
          })
        ).status,
        409,
      );
      assert.equal(
        (await customer.call("/loyalty")).body.data.transactions.length,
        1,
      );
    },
  );
  await t.test(
    "reorder uses current prices and warns on availability",
    async () => {
      const changed = { ...menu[0], price: 55000 };
      await staff.call("/admin/dishes/pho-bo", "PUT", changed);
      assert.equal(
        (await customer.call("/orders/" + order.id + "/reorder", "POST", {}))
          .status,
        200,
      );
      assert.equal(
        (
          await customer.call("/cart/quote", "POST", {
            fulfillment: "PICKUP",
            zoneId: "",
            promo: "",
            points: 0,
          })
        ).body.data.total,
        134000,
      );
      await staff.call("/admin/dishes/pho-bo", "PUT", {
        ...changed,
        available: false,
      });
      assert.equal(
        (await customer.call("/orders/" + order.id + "/reorder", "POST", {}))
          .status,
        409,
      );
      await staff.call("/admin/dishes/pho-bo", "PUT", menu[0]);
    },
  );
  await t.test(
    "loyalty redemption and cancellation refund are transactional and idempotent",
    async () => {
      const r = await customer.call(
        "/orders",
        "POST",
        { ...checkout, points: 50 },
        randomUUID(),
      );
      assert.equal(r.status, 201);
      assert.equal((await customer.call("/loyalty")).body.data.balance, 11);
      const id = r.body.data.id;
      await customer.call("/orders/" + id + "/cancel", "POST", {});
      await customer.call("/orders/" + id + "/cancel", "POST", {});
      assert.equal((await customer.call("/loyalty")).body.data.balance, 61);
      assert.equal(
        (await customer.call("/loyalty")).body.data.transactions.filter(
          (r: any) => r.type === "REFUND",
        ).length,
        1,
      );
    },
  );
  await t.test(
    "delivery workflow and cancelled payment protection",
    async () => {
      await customer.call("/cart/items", "POST", item);
      const r = await customer.call(
        "/orders",
        "POST",
        {
          ...checkout,
          fulfillment: "DELIVERY",
          zoneId: "garden",
          address: "Садовое кольцо, 16/1",
        },
        randomUUID(),
      );
      assert.equal(r.status, 201);
      const id = r.body.data.id;
      for (const status of [
        "CONFIRMED",
        "PREPARING",
        "READY",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
      ])
        assert.equal(
          (
            await staff.call("/admin/orders/" + id + "/status", "PATCH", {
              status,
            })
          ).status,
          200,
        );
      await staff.call("/admin/orders/" + id + "/payment", "POST", {});
      assert.equal(
        (
          await staff.call("/admin/orders/" + id + "/status", "PATCH", {
            status: "COMPLETED",
          })
        ).status,
        200,
      );
    },
  );
  const date = new Date(
    Date.parse(localNow(cfg).date + "T00:00:00Z") + 86400000,
  )
    .toISOString()
    .slice(0, 10);
  const booking = {
    date,
    time: "12:00",
    partySize: 6,
    seating: "Без предпочтений",
    name: "Тест бронирования",
    phone: "+79000000000",
    notes: "",
  };
  let reservationId: string;
  await t.test("reservation rejects invalid date and past slots", async () => {
    assert.equal(
      (
        await customer.call(
          "/reservations/availability?date=2026-02-30&partySize=2",
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await customer.call(
          "/reservations",
          "POST",
          { ...booking, date: "2020-01-01" },
          randomUUID(),
        )
      ).status,
      400,
    );
  });
  await t.test("concurrent bookings cannot exceed capacity", async () => {
    const a = new Client(),
      b = new Client();
    await a.call("/me");
    await b.call("/me");
    const results = await Promise.all([
      a.call("/reservations", "POST", booking, randomUUID()),
      b.call("/reservations", "POST", booking, randomUUID()),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    reservationId = results.find((r) => r.status === 201)!.body.data.id;
    const slots = (
      await customer.call(
        "/reservations/availability?date=" + date + "&partySize=3",
      )
    ).body.data;
    assert.equal(slots.find((s: any) => s.time === "12:30").available, false);
    assert.equal(slots.find((s: any) => s.time === "13:30").available, true);
  });
  await t.test(
    "reservation idempotency, ownership, cancellation releases capacity",
    async () => {
      const key = randomUUID();
      const input = { ...booking, time: "16:00", partySize: 4 };
      const a = await customer.call("/reservations", "POST", input, key);
      assert.equal(a.status, 201);
      assert.equal(
        (await customer.call("/reservations", "POST", input, key)).body.data.id,
        a.body.data.id,
      );
      assert.equal(
        (
          await stranger.call(
            "/reservations/" + a.body.data.id + "/cancel",
            "POST",
            {},
          )
        ).status,
        404,
      );
      assert.equal(
        (
          await customer.call(
            "/reservations/" + a.body.data.id + "/cancel",
            "POST",
            {},
          )
        ).status,
        200,
      );
      await staff.call("/admin/reservations/" + reservationId, "PATCH", {
        status: "CANCELLED",
      });
      assert.equal(
        (
          await customer.call(
            "/reservations/availability?date=" + date + "&partySize=8",
          )
        ).body.data.find((s: any) => s.time === "12:00").available,
        true,
      );
    },
  );
  await t.test(
    "QR resolves opaque token, notifications and audit are saved",
    async () => {
      const table = (await pool.query("SELECT token FROM qr_tables LIMIT 1"))
        .rows[0];
      assert.equal(
        (await customer.call("/dine-in/" + table.token)).status,
        200,
      );
      assert.equal((await customer.call("/dine-in/guess")).status, 404);
      assert.ok((await customer.call("/notifications")).body.data.length > 0);
      await customer.call("/notifications/read", "POST", {});
      assert.ok(
        (await customer.call("/notifications")).body.data.every(
          (n: any) => n.read_at,
        ),
      );
      assert.ok(
        (await staff.call("/admin/dashboard")).body.data.audit.length > 0,
      );
      assert.equal((await stranger.call("/notifications")).body.data.length, 0);
    },
  );
  await t.test(
    "guest history attaches on login and logout isolates session",
    async () => {
      const guest = new Client();
      await guest.call("/me");
      await guest.call("/cart/items", "POST", item);
      const r = await guest.call("/orders", "POST", checkout, randomUUID());
      assert.equal(r.status, 201);
      await guest.call("/auth/register", "POST", {
        name: "Гость теста",
        email: "guest@example.test",
        password: "test-password-123",
      });
      assert.ok(
        (await guest.call("/orders")).body.data.some(
          (o: any) => o.id === r.body.data.id,
        ),
      );
      await guest.call("/auth/logout", "POST", {});
      assert.equal((await guest.call("/orders")).body.data.length, 0);
    },
  );
});
