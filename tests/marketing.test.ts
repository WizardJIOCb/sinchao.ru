import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { app } from "../server/app";
import { pool } from "../server/db";
import { dishAchievements } from "../server/dish-achievements";
import { menu, categories, restaurant } from "./fixtures/demo-catalog";
import type { Promotion } from "../shared/marketing";

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
      email: name + "@marketing.test",
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
  anon = new Client();
const dish = { ...menu[0], modifiers: [], price: 35000 };
const other = { ...menu[1], modifiers: [], price: 20000 };
const p: Promotion = {
  code: "480-TEST",
  title: "Фо-тест",
  percent: 20,
  dishIds: [dish.id],
  enabled: true,
  startsAt: null,
  endsAt: null,
  limit: 1,
  minSubtotal: 0,
};
const input = {
  fulfillment: "PICKUP",
  name: "Тест",
  phone: "+79000000000",
  time: "ASAP",
  promo: p.code,
};
const add = async (c: Client, id = dish.id, quantity = 1) =>
  assert.equal(
    (
      await c.call("/cart/items", "POST", {
        dishId: id,
        quantity,
        modifiers: [],
      })
    ).status,
    200,
  );
before(async () => {
  await pool.query(
    "TRUNCATE audit_logs,notifications,loyalty_transactions,reservations,orders,sessions,users,analytics,qr_tables,restaurant_events,promotions,dish_achievement_rules RESTART IDENTITY CASCADE",
  );
  await pool.query("DELETE FROM dishes");
  await pool.query("DELETE FROM categories");
  for (const [i, c] of categories.entries())
    await pool.query(
      "INSERT INTO categories(id,data,position) VALUES($1,$2,$3)",
      [c.id, JSON.stringify(c), i],
    );
  for (const [i, d] of [dish, other].entries())
    await pool.query("INSERT INTO dishes(id,data,position) VALUES($1,$2,$3)", [
      d.id,
      JSON.stringify(d),
      i,
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
});
after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await pool.end();
});

test("dish levels count orders once, have exact boundaries, isolate dishes and allow custom rules", () => {
  const orders = Array.from({ length: 25 }, () => ({
    items: [{ dishId: dish.id }, { dishId: dish.id }],
  }));
  for (const [count, level, next] of [
    [0, 0, 1],
    [1, 1, 3],
    [2, 1, 3],
    [3, 2, 5],
    [5, 3, 10],
    [10, 4, 20],
    [20, 5, null],
    [25, 5, null],
  ]) {
    const a = dishAchievements([dish, other], orders.slice(0, count as number));
    assert.equal(a[0].orders, count);
    assert.equal(a[0].level, level);
    assert.equal(a[0].nextTarget, next);
    assert.equal(a[1].level, 0);
  }
  const rule = {
    dishId: dish.id,
    name: "Фо-кусь",
    enabled: true,
    milestones: [2, 4, 6, 8, 10],
  };
  assert.equal(
    dishAchievements([dish], orders.slice(0, 3), [rule])[0].level,
    1,
  );
  assert.equal(
    dishAchievements([dish], orders, [{ ...rule, enabled: false }]).length,
    0,
  );
});

test("marketing permissions, discounts, expiry, concurrent last-use, replay and historical achievements", async (t) => {
  await t.test(
    "only managers can manage promotions and achievement rules",
    async () => {
      assert.equal((await anon.call("/admin/marketing")).status, 403);
      assert.equal(
        (await alice.call("/admin/marketing/promotions/" + p.code, "PUT", p))
          .status,
        403,
      );
      await pool.query("UPDATE users SET role='STAFF' WHERE id=$1", [bob.id]);
      assert.equal((await bob.call("/admin/marketing")).status, 403);
      await pool.query("UPDATE users SET role='CUSTOMER' WHERE id=$1", [
        bob.id,
      ]);
      assert.equal(
        (
          await admin.call("/admin/marketing/promotions/" + p.code, "PUT", {
            ...p,
            percent: 0,
          })
        ).status,
        400,
      );
      assert.equal(
        (await admin.call("/admin/marketing/promotions/" + p.code, "PUT", p))
          .status,
        200,
      );
    },
  );
  await t.test(
    "quote discounts eligible lines only; enforces minimum, dates and disabled state",
    async () => {
      await add(alice, dish.id, 2);
      await add(alice, other.id);
      const quote = () =>
        alice.call("/cart/quote", "POST", {
          fulfillment: "PICKUP",
          promo: p.code.toLowerCase(),
        });
      const q = await quote();
      assert.equal(q.status, 200);
      assert.equal(q.data.discount, 14000);
      assert.equal(q.data.total, 76000);
      assert.equal(q.data.promoCode, p.code);
      for (const change of [
        { minSubtotal: 100000 },
        { enabled: false },
        { startsAt: "2099-01-01T00:00:00Z" },
        { endsAt: "2020-01-01T00:00:00Z" },
      ]) {
        assert.equal(
          (
            await admin.call("/admin/marketing/promotions/" + p.code, "PUT", {
              ...p,
              ...change,
            })
          ).status,
          200,
        );
        assert.equal((await quote()).status, 400);
      }
      await admin.call("/admin/marketing/promotions/" + p.code, "PUT", p);
      await add(bob, other.id);
      assert.equal(
        (
          await bob.call("/cart/quote", "POST", {
            fulfillment: "PICKUP",
            promo: p.code,
          })
        ).error.code,
        "PROMO_DISH",
      );
      await bob.call("/cart", "DELETE", {});
      await add(bob);
    },
  );
  await t.test(
    "QR table orders apply discounts and preserve idempotency",
    async () => {
      const code = "QR480";
      await admin.call("/admin/marketing/promotions/" + code, "PUT", {
        ...p,
        code,
        limit: 2,
      });
      const tableId = randomUUID();
      await pool.query(
        "INSERT INTO qr_tables(id,token,name,seats,zone,shape,x,y) VALUES($1,'marketing-qr','Промо стол',4,'Зал','long',10,10)",
        [tableId],
      );
      const visit = await admin.call("/admin/v2/visits", "POST", { tableId });
      assert.equal(visit.status, 201);
      assert.equal(
        (
          await bob.call("/v2/visits/join", "POST", {
            token: "marketing-qr",
            code: visit.data.joinCode,
          })
        ).status,
        200,
      );
      const key = randomUUID();
      const order = await bob.call(
        `/v2/visits/${visit.data.id}/orders`,
        "POST",
        { promo: code },
        key,
      );
      assert.equal(order.status, 201);
      assert.equal(order.data.discount, 7000);
      assert.equal(
        (
          await bob.call(
            `/v2/visits/${visit.data.id}/orders`,
            "POST",
            { promo: code },
            key,
          )
        ).data.id,
        order.data.id,
      );
      assert.equal(
        (
          await bob.call(
            `/v2/visits/${visit.data.id}/orders`,
            "POST",
            { promo: p.code },
            key,
          )
        ).status,
        409,
      );
      assert.equal(
        (await pool.query("SELECT used FROM promotions WHERE code=$1", [code]))
          .rows[0].used,
        1,
      );
      await add(bob);
    },
  );
  let winner: Client, orderId: string;
  await t.test(
    "simultaneous checkout cannot exceed one use and retry cannot consume twice",
    async () => {
      const keys = [randomUUID(), randomUUID()];
      const clients = [alice, bob];
      const results = await Promise.all(
        clients.map((c, i) => c.call("/orders", "POST", input, keys[i])),
      );
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 400]);
      const index = results.findIndex((r) => r.status === 201);
      winner = clients[index];
      orderId = results[index].data.id;
      const retry = await winner.call("/orders", "POST", input, keys[index]);
      assert.equal(retry.status, 201);
      assert.equal(retry.data.id, orderId);
      const state = await admin.call("/admin/marketing");
      assert.equal(state.data.promotions[0].used, 1);
    },
  );
  await t.test(
    "only own paid completed orders contribute; edits recalculate historical levels",
    async () => {
      const progress = async (c: Client) =>
        (await c.call("/v2/discovery")).data.dishAchievements.find(
          (a: any) => a.dish.id === dish.id,
        );
      assert.equal((await progress(winner)).orders, 0);
      await pool.query("UPDATE orders SET status='COMPLETED' WHERE id=$1", [
        orderId,
      ]);
      assert.equal((await progress(winner)).orders, 0);
      await pool.query("UPDATE orders SET payment_status='PAID' WHERE id=$1", [
        orderId,
      ]);
      assert.equal((await progress(winner)).orders, 1);
      assert.equal((await progress(winner === alice ? bob : alice)).orders, 0);
      assert.equal((await progress(anon)).orders, 0);
      const rule = {
        dishId: dish.id,
        name: "Фо-кусь тест",
        enabled: true,
        milestones: [2, 4, 6, 8, 10],
      };
      assert.equal(
        (
          await admin.call("/admin/marketing/achievements/" + dish.id, "PUT", {
            ...rule,
            milestones: [2, 1, 6, 8, 10],
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await admin.call(
            "/admin/marketing/achievements/" + dish.id,
            "PUT",
            rule,
          )
        ).status,
        200,
      );
      assert.equal((await progress(winner)).level, 0);
      assert.equal((await progress(winner)).name, rule.name);
      await admin.call("/admin/marketing/achievements/" + dish.id, "PUT", {
        ...rule,
        enabled: false,
      });
      assert.equal(await progress(winner), undefined);
      await admin.call("/admin/marketing/achievements/" + dish.id, "PUT", {
        ...rule,
        enabled: true,
      });
      await pool.query("UPDATE orders SET status='CANCELLED' WHERE id=$1", [
        orderId,
      ]);
      assert.equal((await progress(winner)).orders, 0);
      assert.ok(
        (
          await pool.query(
            "SELECT id FROM audit_logs WHERE action='ACHIEVEMENT_UPDATE'",
          )
        ).rowCount! >= 3,
      );
    },
  );
});

test("operator dashboard and role management enforce access, immediate revocation and last-admin safety", async () => {
  assert.equal((await anon.call("/admin/operator")).status, 403);
  assert.equal((await alice.call("/admin/users")).status, 403);
  const list = await admin.call("/admin/users?q=bob");
  assert.equal(list.status, 200);
  assert.equal(list.data.users.length, 1);
  assert.ok(!("password_hash" in list.data.users[0]));
  const role = (
    actor: Client,
    target: Client,
    value: string,
    expectedRole: string,
  ) =>
    actor.call(`/admin/users/${target.id}/role`, "PATCH", {
      role: value,
      expectedRole,
    });
  assert.equal((await role(alice, alice, "ADMIN", "CUSTOMER")).status, 403);
  assert.equal((await role(admin, admin, "CUSTOMER", "ADMIN")).status, 409);
  assert.equal((await role(admin, bob, "STAFF", "CUSTOMER")).status, 200);
  const state = await bob.call("/admin/operator");
  assert.equal(state.status, 200);
  assert.ok(state.data.tables.length > 0);
  assert.ok(state.data.visits.length > 0);
  assert.ok(state.data.now.timezone);
  assert.ok(
    state.data.orders.every(
      (o: any) => !["COMPLETED", "CANCELLED"].includes(o.status),
    ),
  );
  assert.equal((await bob.call("/admin/users")).status, 403);
  assert.equal((await role(bob, alice, "ADMIN", "CUSTOMER")).status, 403);
  assert.equal((await role(admin, bob, "MANAGER", "CUSTOMER")).status, 409);
  assert.equal((await role(admin, bob, "MANAGER", "STAFF")).status, 200);
  assert.equal((await bob.call("/admin/users")).status, 403);
  assert.equal((await role(admin, bob, "CUSTOMER", "MANAGER")).status, 200);
  assert.equal((await bob.call("/admin/operator")).status, 403);
  assert.equal((await role(admin, bob, "ADMIN", "CUSTOMER")).status, 200);
  const parallel = await Promise.all([
    role(admin, bob, "CUSTOMER", "ADMIN"),
    role(bob, admin, "CUSTOMER", "ADMIN"),
  ]);
  assert.deepEqual(parallel.map((r) => r.status).sort(), [200, 403]);
  assert.equal(
    (await pool.query("SELECT count(*)::int n FROM users WHERE role='ADMIN'"))
      .rows[0].n,
    1,
  );
  assert.ok(
    (
      await pool.query(
        "SELECT id FROM audit_logs WHERE action='USER_ROLE_CHANGED'",
      )
    ).rowCount! >= 5,
  );
});

test("gifted achievement progress is private, additive and does not fabricate activity", async () => {
  const before = (await alice.call("/v2/discovery")).data;
  const original = before.dishAchievements.find(
    (a: any) => a.dish.id === dish.id,
  );
  const otherBefore = (await bob.call("/v2/discovery")).data;
  const activity = async () =>
    (
      await pool.query(
        "SELECT (SELECT count(*) FROM orders)::integer AS orders, (SELECT count(*) FROM loyalty_transactions)::integer AS loyalty",
      )
    ).rows[0];
  const countsBefore = await activity();
  for (let i = 0; i < 2; i++)
    await pool.query(
      "INSERT INTO achievement_grants(user_id,grant_key,dish_id,progress,reason) VALUES($1,$2,$3,7,$4) ON CONFLICT DO NOTHING",
      [alice.id, "test-gift", dish.id, "Test gift"],
    );
  const after = (await alice.call("/v2/discovery")).data;
  const gifted = after.dishAchievements.find((a: any) => a.dish.id === dish.id);
  assert.equal(gifted.orders, original.orders + 7);
  assert.equal(gifted.awardedProgress, 7);
  assert.equal(
    gifted.level,
    gifted.milestones.filter((n: number) => gifted.orders >= n).length,
  );
  assert.deepEqual(after.generalAchievements, before.generalAchievements);
  assert.deepEqual(after.achievements, before.achievements);
  assert.deepEqual(after.journey, before.journey);
  assert.equal(after.completedOrders, before.completedOrders);
  assert.deepEqual(
    (await bob.call("/v2/discovery")).data.dishAchievements,
    otherBefore.dishAchievements,
  );
  assert.ok(
    (await anon.call("/v2/discovery")).data.dishAchievements.every(
      (a: any) => a.awardedProgress === 0,
    ),
  );
  assert.deepEqual(await activity(), countsBefore);
  await pool.query("DELETE FROM achievement_grants WHERE user_id=$1", [
    alice.id,
  ]);
});
