import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { app } from "../server/app";
import { pool } from "../server/db";
import { localNow } from "../server/lib";
import { equalShares } from "../server/modules/v2-core";
import { restaurant, menu, categories } from "./fixtures/demo-catalog";

test("split preserves every kopeck when total is not divisible", () => {
  assert.deepEqual(equalShares(35000, 3), [11667, 11667, 11666]);
  assert.throws(() => equalShares(0, 2));
  assert.throws(() => equalShares(1, 2));
});

if (
  !new URL(process.env.DATABASE_URL ?? "http://invalid").pathname.endsWith(
    "_test",
  )
)
  throw Error("Isolated _test database required");
let server: ReturnType<typeof app.listen>, base: string;
const offset = new Date().getUTCHours() - 12;
const cfg = {
  ...restaurant,
  timezone: `Etc/GMT${offset >= 0 ? "+" : "-"}${Math.abs(offset)}`,
  openHour: 0,
  closeHour: 24,
  leadMinutes: 10,
  capacity: 24,
  maxGuests: 8,
  demo: true,
};
const tableId = randomUUID(),
  token = "v2-test-table-token",
  table2 = randomUUID();
const dish = {
  ...menu[0],
  price: 35001,
  region: "Северный Вьетнам",
  allergens: ["соя"],
  spice: 1,
};
class Client {
  cookie = "";
  async call(path: string, method = "GET", body?: unknown, key?: string) {
    const r = await fetch(base + path, {
      signal: AbortSignal.timeout(15000),
      method,
      headers: {
        "Content-Type": "application/json",
        Cookie: this.cookie,
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const c = r.headers.getSetCookie().at(-1);
    if (c) this.cookie = c.split(";")[0];
    return { status: r.status, ...(await r.json()) };
  }
  async register(name: string) {
    const r = await this.call("/auth/register", "POST", {
      name,
      email: name + "@v2.test",
      password: "isolated-test-password",
      phone: "+79000000000",
    });
    assert.equal(r.status, 201, JSON.stringify(r));
    return r.data.id;
  }
}
const staff = new Client(),
  alice = new Client(),
  bob = new Client(),
  guest = new Client(),
  stranger = new Client();
let aliceId: string, bobId: string;
const add = async (c: Client) => {
  const r = await c.call("/cart/items", "POST", {
    dishId: dish.id,
    quantity: 1,
    modifiers: ["beef"],
    notes: "V2 isolated test",
  });
  assert.equal(r.status, 200, JSON.stringify(r));
};
const book = (date: string, time: string, extra = {}) => ({
  date,
  time,
  partySize: 2,
  seating: cfg.seating[0],
  name: "Тест V2",
  phone: "+79000000000",
  tableId,
  ...extra,
});
before(async () => {
  await pool.query(
    "TRUNCATE audit_logs,notifications,loyalty_transactions,reservations,orders,sessions,users,analytics,qr_tables,restaurant_events RESTART IDENTITY CASCADE",
  );
  await pool.query("DELETE FROM dishes");
  await pool.query("DELETE FROM categories");
  for (const [i, c] of categories.entries())
    await pool.query(
      "INSERT INTO categories(id,data,position) VALUES($1,$2,$3)",
      [c.id, JSON.stringify(c), i],
    );
  for (const [i, d] of menu.entries())
    await pool.query("INSERT INTO dishes(id,data,position) VALUES($1,$2,$3)", [
      d.id,
      JSON.stringify(i === 0 ? dish : d),
      i,
    ]);
  await pool.query("UPDATE restaurant SET data=$1 WHERE id=1", [
    JSON.stringify(cfg),
  ]);
  await pool.query("UPDATE v2_settings SET data=$1 WHERE id=1", [
    JSON.stringify({
      floorPlanVerified: false,
      referralPoints: 100,
      referralsEnabled: true,
      giftValidityDays: 365,
    }),
  ]);
  await pool.query(
    "INSERT INTO qr_tables(id,token,name,seats) VALUES($1,$2,$3,4),($4,$5,$6,8)",
    [tableId, token, "Тест стол 1", table2, "v2-table-2", "Тест стол 2"],
  );
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  base = "http://127.0.0.1:" + (server.address() as any).port + "/api";
  const staffId = await staff.register("staff");
  await pool.query("UPDATE users SET role='ADMIN' WHERE id=$1", [staffId]);
  aliceId = await alice.register("alice");
  bobId = await bob.register("bob");
  await guest.call("/me");
  await stranger.call("/me");
});
after(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
  await pool.end();
});
test("V2 restaurant, discovery and CRM workflows", async (t) => {
  const tomorrow = new Date(
    Date.parse(localNow(cfg).date + "T00:00:00Z") + 86400000,
  )
    .toISOString()
    .slice(0, 10);
  let reservationId: string,
    visitId: string,
    visitCode: string,
    orderId: string;
  await t.test(
    "floor hides QR tokens, staff writes protected, unverified plan blocked outside demo",
    async () => {
      const floor = await guest.call("/v2/floor");
      assert.equal(floor.status, 200);
      assert.equal(floor.data.verified, false);
      assert.equal(floor.data.tables[0].token, undefined);
      assert.equal((await guest.call("/admin/v2/tables")).status, 403);
      assert.equal(
        (await alice.call("/admin/v2/visits", "POST", { tableId })).status,
        403,
      );
      await pool.query("UPDATE restaurant SET data=$1 WHERE id=1", [
        JSON.stringify({ ...cfg, demo: false }),
      ]);
      assert.equal((await guest.call("/v2/floor")).data.tables.length, 0);
      assert.equal(
        (
          await alice.call(
            "/reservations",
            "POST",
            book(tomorrow, "12:00"),
            randomUUID(),
          )
        ).status,
        409,
      );
      await pool.query("UPDATE restaurant SET data=$1 WHERE id=1", [
        JSON.stringify(cfg),
      ]);
    },
  );
  await t.test(
    "specific table cannot be double-booked; adjacent slot and cancellation release it",
    async () => {
      const results = await Promise.all([
        alice.call(
          "/reservations",
          "POST",
          book(tomorrow, "12:00"),
          randomUUID(),
        ),
        bob.call(
          "/reservations",
          "POST",
          book(tomorrow, "12:00"),
          randomUUID(),
        ),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
      const i = results.findIndex((r) => r.status === 201),
        r = results[i];
      assert.equal(r.data.tableId, tableId);
      const floor = (
        await alice.call(`/v2/floor?date=${tomorrow}&time=12:30&partySize=2`)
      ).data;
      assert.equal(
        floor.tables.find((t: any) => t.id === tableId).available,
        false,
      );
      assert.equal(
        (
          await alice.call(`/v2/floor?date=${tomorrow}&time=13:30&partySize=2`)
        ).data.tables.find((t: any) => t.id === tableId).available,
        true,
      );
      assert.equal(
        (await stranger.call(`/reservations/${r.data.id}/cancel`, "POST", {}))
          .status,
        404,
      );
      assert.equal(
        (
          await [alice, bob][i].call(
            `/reservations/${r.data.id}/cancel`,
            "POST",
            {},
          )
        ).status,
        200,
      );
    },
  );
  await t.test(
    "pre-order snapshot, idempotent reservation, activation once on arrival",
    async () => {
      await add(alice);
      const date = localNow(cfg).date;
      const slots = (
        await alice.call(`/reservations/availability?date=${date}&partySize=2`)
      ).data;
      const slot = slots.find((s: any) => s.available);
      assert.ok(
        slot,
        "test must run while a same-day reservation slot remains",
      );
      const input = book(date, slot.time, { preorder: true }),
        key = randomUUID();
      const r = await alice.call("/reservations", "POST", input, key);
      assert.equal(r.status, 201, JSON.stringify(r));
      reservationId = r.data.id;
      assert.equal(r.data.preorder.items.length, 1);
      assert.equal(r.data.preorder.total, 47001);
      assert.equal((await alice.call("/cart")).data.length, 0);
      assert.equal(
        (await alice.call("/reservations", "POST", input, key)).data.id,
        reservationId,
      );
      const open = await staff.call("/admin/v2/visits", "POST", {
        tableId,
        reservationId,
      });
      assert.equal(open.status, 201, JSON.stringify(open));
      visitId = open.data.id;
      visitCode = open.data.joinCode;
      assert.equal(open.data.orders.length, 1);
      orderId = open.data.orders[0].id;
      assert.equal(
        (
          await staff.call("/admin/v2/visits", "POST", {
            tableId,
            reservationId,
          })
        ).data.orders.length,
        1,
      );
      assert.equal((await alice.call("/v2/visit")).data.id, visitId);
      assert.equal(
        (await alice.call(`/reservations/${reservationId}/cancel`, "POST", {}))
          .status,
        409,
      );
    },
  );
  await t.test(
    "visit code and membership prevent access; waiter call deduplicates; guest history survives login",
    async () => {
      assert.equal((await stranger.call(`/v2/visits/${visitId}`)).status, 404);
      assert.equal(
        (
          await stranger.call("/v2/visits/join", "POST", {
            token,
            code: "000000",
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await guest.call("/v2/visits/join", "POST", {
            token,
            code: visitCode,
          })
        ).status,
        200,
      );
      const v = (await guest.call(`/v2/visits/${visitId}`)).data;
      assert.equal(v.joinCode, undefined);
      assert.equal(v.orders[0].contact.phone, "");
      await Promise.all([
        guest.call(`/v2/visits/${visitId}/call`, "POST", { kind: "WAITER" }),
        guest.call(`/v2/visits/${visitId}/call`, "POST", { kind: "WAITER" }),
      ]);
      assert.equal(
        (await staff.call("/admin/v2/visits")).data[0].calls.filter(
          (c: any) => c.status === "OPEN",
        ).length,
        1,
      );
      await guest.register("guest");
      assert.equal((await guest.call("/v2/visit")).data.id, visitId);
    },
  );
  await t.test(
    "QR adds orders once; exact shares lock bill changes and require staff payment",
    async () => {
      await add(guest);
      const key = randomUUID();
      const rs = await Promise.all([
        guest.call(`/v2/visits/${visitId}/orders`, "POST", {}, key),
        guest.call(`/v2/visits/${visitId}/orders`, "POST", {}, key),
      ]);
      assert.ok(rs.every((r) => r.status === 201));
      assert.equal(rs[0].data.id, rs[1].data.id);
      assert.equal((await guest.call("/cart")).data.length, 0);
      const split = await guest.call(`/v2/visits/${visitId}/split`, "POST", {
        count: 3,
      });
      assert.equal(split.status, 200, JSON.stringify(split));
      assert.deepEqual(
        split.data.shares.map((s: any) => s.amount),
        equalShares(94002, 3),
      );
      assert.equal(
        (await alice.call(`/orders/${orderId}/cancel`, "POST", {})).status,
        409,
      );
      assert.equal(
        (await staff.call(`/admin/orders/${orderId}/payment`, "POST", {}))
          .status,
        409,
      );
      await add(guest);
      assert.equal(
        (
          await guest.call(
            `/v2/visits/${visitId}/orders`,
            "POST",
            {},
            randomUUID(),
          )
        ).status,
        409,
      );
      const share = split.data.shares[0];
      assert.equal(
        (
          await guest.call(
            `/admin/v2/visits/${visitId}/shares/${share.id}/pay`,
            "POST",
            {},
          )
        ).status,
        403,
      );
      await Promise.all([
        staff.call(
          `/admin/v2/visits/${visitId}/shares/${share.id}/pay`,
          "POST",
          {},
        ),
        staff.call(
          `/admin/v2/visits/${visitId}/shares/${share.id}/pay`,
          "POST",
          {},
        ),
      ]);
      assert.equal(
        (await staff.call("/admin/v2/visits")).data[0].paid,
        share.amount,
      );
      assert.equal(
        (await staff.call(`/admin/v2/visits/${visitId}/split`, "DELETE", {}))
          .status,
        409,
      );
      for (const s of split.data.shares.slice(1))
        assert.equal(
          (
            await staff.call(
              `/admin/v2/visits/${visitId}/shares/${s.id}/pay`,
              "POST",
              {},
            )
          ).status,
          200,
        );
      assert.equal(
        (await staff.call(`/admin/v2/visits/${visitId}/close`, "POST", {}))
          .status,
        409,
      );
      const v = (await staff.call("/admin/v2/visits")).data[0];
      assert.ok(v.orders.every((o: any) => o.paymentStatus === "PAID"));
      for (const o of v.orders)
        for (const status of ["CONFIRMED", "PREPARING", "READY", "COMPLETED"])
          assert.equal(
            (
              await staff.call(`/admin/orders/${o.id}/status`, "PATCH", {
                status,
              })
            ).status,
            200,
          );
      assert.equal(
        (await staff.call(`/admin/v2/visits/${visitId}/close`, "POST", {}))
          .status,
        200,
      );
      assert.equal((await guest.call("/v2/visit")).data, null);
      assert.equal(
        (
          await stranger.call("/v2/visits/join", "POST", {
            token,
            code: visitCode,
          })
        ).status,
        403,
      );
    },
  );
  await t.test(
    "recommendations explain favorites; completed purchases unlock journey; allergy unknowns excluded",
    async () => {
      assert.equal(
        (
          await stranger.call("/v2/preferences", "PUT", {
            favorites: [dish.id],
            maxSpice: 3,
            avoidAllergens: [],
          })
        ).status,
        401,
      );
      await alice.call("/v2/preferences", "PUT", {
        favorites: [dish.id],
        maxSpice: 3,
        avoidAllergens: [],
      });
      let d = (await alice.call("/v2/discovery")).data;
      assert.equal(d.recommendations[0].reason, "Вы сохранили это блюдо");
      assert.ok(d.achievements.find((a: any) => a.id === "first").earned);
      assert.ok(
        d.journey.some((j: any) =>
          j.dishes.some((x: any) => x.id === dish.id && x.tried),
        ),
      );
      await alice.call("/v2/preferences", "PUT", {
        favorites: [dish.id],
        maxSpice: 3,
        avoidAllergens: ["соя"],
      });
      d = (await alice.call("/v2/discovery")).data;
      assert.ok(!d.recommendations.some((r: any) => r.dish.id === dish.id));
      assert.ok(d.recommendations.every((r: any) => r.dish.allergens.length));
    },
  );
  await t.test(
    "event capacity is transactional, cancellation releases seats, unpublished hidden",
    async () => {
      const event = {
        title: "Тест встречи",
        description: "Изолированный тест",
        starts_at: new Date(Date.now() + 86400000).toISOString(),
        capacity: 3,
        active: true,
      };
      const r = await staff.call("/admin/v2/events/new", "PUT", event);
      assert.equal(r.status, 200);
      const id = r.data.id;
      const result = await Promise.all([
        alice.call(`/v2/events/${id}/signup`, "PUT", { guests: 2 }),
        bob.call(`/v2/events/${id}/signup`, "PUT", { guests: 2 }),
      ]);
      assert.deepEqual(result.map((r) => r.status).sort(), [200, 409]);
      const c = [alice, bob][result.findIndex((r) => r.status === 200)];
      assert.equal(
        (
          await staff.call(`/admin/v2/events/${id}`, "PUT", {
            ...event,
            capacity: 1,
          })
        ).status,
        409,
      );
      await c.call(`/v2/events/${id}/signup`, "DELETE", {});
      assert.equal(
        (await bob.call(`/v2/events/${id}/signup`, "PUT", { guests: 3 }))
          .status,
        200,
      );
      await staff.call(`/admin/v2/events/${id}`, "PUT", {
        ...event,
        active: false,
      });
      assert.equal((await stranger.call("/v2/events")).data.length, 0);
      assert.equal((await bob.call("/v2/events")).data[0].active, false);
    },
  );
  let giftCode: string;
  await t.test(
    "certificates pay table shares, protect partial receipts and preserve exact totals",
    async () => {
      const opened = await staff.call("/admin/v2/visits", "POST", {
        tableId: table2,
      });
      const v = opened.data;
      await bob.call("/v2/visits/join", "POST", {
        token: "v2-table-2",
        code: v.joinCode,
      });
      await add(bob);
      const order = await bob.call(
        `/v2/visits/${v.id}/orders`,
        "POST",
        {},
        randomUUID(),
      );
      assert.equal(order.status, 201);
      const split = await staff.call(`/admin/v2/visits/${v.id}/split`, "POST", {
        count: 1,
      });
      const share = split.data.shares[0];
      const gift = await bob.call(
        "/v2/gifts",
        "POST",
        { amount: 100000, message: "За столом" },
        randomUUID(),
      );
      await staff.call(`/admin/v2/gifts/${gift.data.id}/activate`, "POST", {});
      const code = (await bob.call("/v2/gifts")).data.find(
        (g: any) => g.id === gift.data.id,
      ).code;
      assert.equal(
        (
          await staff.call(
            "/admin/v2/gifts/redeem",
            "POST",
            { code, shareId: share.id, amount: 10000 },
            randomUUID(),
          )
        ).status,
        200,
      );
      assert.equal((await bob.call("/v2/visit")).data.paid, 10000);
      assert.equal(
        (await staff.call(`/admin/v2/visits/${v.id}/split`, "DELETE", {}))
          .status,
        409,
      );
      assert.equal(
        (
          await staff.call(
            "/admin/v2/gifts/redeem",
            "POST",
            { code, shareId: share.id, amount: share.amount - 10000 },
            randomUUID(),
          )
        ).status,
        200,
      );
      assert.equal(
        (await bob.call("/v2/visit")).data.orders[0].paymentStatus,
        "PAID",
      );
      assert.equal(
        (
          await staff.call(
            "/admin/v2/gifts/redeem",
            "POST",
            { code, shareId: share.id, amount: 1 },
            randomUUID(),
          )
        ).status,
        409,
      );
      // Leave this visit open for subsequent membership isolation checks; no order completion yet.
    },
  );
  const pickup = async (c: Client) => {
    await add(c);
    const r = await c.call(
      "/orders",
      "POST",
      {
        fulfillment: "PICKUP",
        name: "Тест",
        phone: "+79000000000",
        time: "ASAP",
      },
      randomUUID(),
    );
    assert.equal(r.status, 201, JSON.stringify(r));
    return r.data.id;
  };
  await t.test(
    "gift payment activation, concurrent spending, idempotency and refunds protection",
    async () => {
      const key = randomUUID(),
        r = await alice.call(
          "/v2/gifts",
          "POST",
          { amount: 10000, message: "Тест" },
          key,
        );
      assert.equal(r.status, 201);
      const id = r.data.id;
      assert.equal(
        (
          await alice.call(
            "/v2/gifts",
            "POST",
            { amount: 10000, message: "Тест" },
            key,
          )
        ).data.id,
        id,
      );
      assert.equal((await alice.call("/v2/gifts")).data[0].code, null);
      assert.equal(
        (await bob.call(`/admin/v2/gifts/${id}/activate`, "POST", {})).status,
        403,
      );
      await staff.call(`/admin/v2/gifts/${id}/activate`, "POST", {});
      giftCode = (await alice.call("/v2/gifts")).data[0].code;
      const a = await pickup(alice),
        b = await pickup(bob),
        ka = randomUUID(),
        kb = randomUUID();
      const results = await Promise.all([
        staff.call(
          "/admin/v2/gifts/redeem",
          "POST",
          { code: giftCode, orderId: a, amount: 7000 },
          ka,
        ),
        staff.call(
          "/admin/v2/gifts/redeem",
          "POST",
          { code: giftCode, orderId: b, amount: 7000 },
          kb,
        ),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      const ix = results.findIndex((r) => r.status === 200),
        oid = [a, b][ix];
      assert.equal(
        (
          await staff.call(
            "/admin/v2/gifts/redeem",
            "POST",
            { code: giftCode, orderId: oid, amount: 7000 },
            [ka, kb][ix],
          )
        ).status,
        200,
      );
      assert.equal((await alice.call("/v2/gifts")).data[0].balance, 3000);
      await staff.call(`/admin/v2/gifts/${id}/activate`, "POST", {});
      assert.equal((await alice.call("/v2/gifts")).data[0].balance, 3000);
      assert.equal(
        (await [alice, bob][ix].call(`/orders/${oid}/cancel`, "POST", {}))
          .status,
        409,
      );
      assert.equal(
        (
          await staff.call(`/admin/orders/${oid}/status`, "PATCH", {
            status: "CANCELLED",
          })
        ).status,
        409,
      );
      await pool.query(
        "UPDATE gift_certificates SET expires_at=now()-interval '1 day' WHERE id=$1",
        [id],
      );
      assert.equal(
        (
          await staff.call(
            "/admin/v2/gifts/redeem",
            "POST",
            { code: giftCode, orderId: oid, amount: 1000 },
            randomUUID(),
          )
        ).status,
        409,
      );
    },
  );
  await t.test(
    "referrals reject self/late application and reward each party once on completion",
    async () => {
      const ref = (await alice.call("/v2/referrals")).data;
      assert.equal(
        (await alice.call("/v2/referrals/apply", "POST", { code: ref.code }))
          .status,
        400,
      );
      assert.equal(
        (await bob.call("/v2/referrals/apply", "POST", { code: ref.code }))
          .status,
        200,
      );
      const code = (await bob.call("/v2/referrals")).data.code;
      assert.equal(
        (await alice.call("/v2/referrals/apply", "POST", { code })).status,
        409,
      );
      const id = await pickup(bob);
      assert.equal(
        (
          await pool.query(
            "SELECT * FROM loyalty_transactions WHERE type='REFERRAL'",
          )
        ).rowCount,
        0,
      );
      await staff.call(`/admin/orders/${id}/payment`, "POST", {});
      for (const status of ["CONFIRMED", "PREPARING", "READY", "COMPLETED"])
        assert.equal(
          (await staff.call(`/admin/orders/${id}/status`, "PATCH", { status }))
            .status,
          200,
        );
      assert.equal(
        (
          await pool.query(
            "SELECT * FROM loyalty_transactions WHERE type='REFERRAL'",
          )
        ).rowCount,
        2,
      );
      const again = await pickup(bob);
      await staff.call(`/admin/orders/${again}/payment`, "POST", {});
      for (const status of ["CONFIRMED", "PREPARING", "READY", "COMPLETED"])
        await staff.call(`/admin/orders/${again}/status`, "PATCH", { status });
      assert.equal(
        (
          await pool.query(
            "SELECT * FROM loyalty_transactions WHERE type='REFERRAL'",
          )
        ).rowCount,
        2,
      );
    },
  );
});
