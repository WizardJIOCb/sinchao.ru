import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { app } from "../server/app";
import { pool, transaction } from "../server/db";
import { grantRegistrationPromotion } from "../server/registration-promotions";
import { registrationSource } from "../shared/app-registration";
import { menu, categories, restaurant } from "./fixtures/demo-catalog";
import type { Promotion } from "../shared/marketing";

if (
  !new URL(process.env.DATABASE_URL ?? "http://invalid").pathname.endsWith(
    "_test",
  )
)
  throw Error("Test DB only");
let server: ReturnType<typeof app.listen>, base: string;
const password = "local-welcome-test-password";
class Client {
  cookie = "";
  id = "";
  email = "";
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
  async register(name: string, source = "web") {
    this.email = name + "@welcome.test";
    const r = await this.call("/auth/register", "POST", {
      name,
      email: this.email,
      password,
      registrationSource: source,
    });
    assert.equal(r.status, 201);
    this.id = r.data.id;
    return r;
  }
}
const admin = new Client(),
  web = new Client(),
  mobile = new Client(),
  other = new Client(),
  anon = new Client();
const dish = { ...menu[0], modifiers: [], price: 35000 };
const gift: Promotion = {
  code: "APP200",
  title: "Подарок за регистрацию",
  kind: "fixed",
  amount: 20000,
  percent: 0,
  dishIds: [],
  enabled: true,
  startsAt: null,
  endsAt: null,
  limit: null,
  minSubtotal: 0,
  registrationGift: true,
};
const quote = { fulfillment: "PICKUP", zoneId: "", promo: "APP200", points: 0 };
const order = {
  ...quote,
  name: "Тест",
  phone: "+79000000000",
  time: "ASAP",
  notes: "",
};
async function add(c: Client) {
  assert.equal(
    (
      await c.call("/cart/items", "POST", {
        dishId: dish.id,
        quantity: 1,
        modifiers: [],
        notes: "",
      })
    ).status,
    200,
  );
}
before(async () => {
  await pool.query(
    "TRUNCATE users,orders,sessions,notifications,audit_logs,promotions,qr_tables RESTART IDENTITY CASCADE",
  );
  await pool.query("DELETE FROM dishes");
  await pool.query("DELETE FROM categories");
  for (const [i, c] of categories.entries())
    await pool.query(
      "INSERT INTO categories(id,data,position) VALUES($1,$2,$3)",
      [c.id, c, i],
    );
  await pool.query("INSERT INTO dishes(id,data,position) VALUES($1,$2,0)", [
    dish.id,
    dish,
  ]);
  const offset = new Date().getUTCHours() - 12;
  await pool.query("UPDATE restaurant SET data=$1 WHERE id=1", [
    {
      ...restaurant,
      timezone: `Etc/GMT${offset >= 0 ? "+" : "-"}${Math.abs(offset)}`,
      openHour: 0,
      closeHour: 24,
      leadMinutes: 10,
    },
  ]);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as any).port}/api`;
  await admin.register("admin");
  await pool.query("UPDATE users SET role='ADMIN' WHERE id=$1", [admin.id]);
});
after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await pool.end();
});

test("Only installed mobile clients request the registration gift", () => {
  assert.equal(registrationSource(true, "Android"), "mobile_app");
  assert.equal(registrationSource(true, "iPhone"), "mobile_app");
  assert.equal(registrationSource(true, "Macintosh", 5), "mobile_app");
  assert.equal(registrationSource(false, "Android"), "web");
  assert.equal(registrationSource(true, "Windows NT"), "web");
});

test("Personal registration discounts are editable, isolated and consumed atomically", async (t) => {
  await t.test(
    "admin config and one-time issuance only during qualifying signup",
    async () => {
      assert.equal(
        (await admin.call("/admin/marketing/promotions/APP200", "PUT", gift))
          .status,
        200,
      );
      assert.deepEqual(
        (await web.register("web")).data.registrationPromotions,
        [],
      );
      assert.deepEqual(
        (await mobile.register("mobile", "mobile_app")).data
          .registrationPromotions,
        ["APP200"],
      );
      await other.register("other", "mobile_app");
      assert.deepEqual(
        await transaction((db) => grantRegistrationPromotion(db, mobile.id)),
        [],
      );
      assert.equal((await mobile.call("/me/promotions")).data.length, 1);
      assert.equal((await web.call("/me/promotions")).data.length, 0);
      assert.equal((await anon.call("/me/promotions")).data.length, 0);
      assert.equal(
        (await web.call("/admin/marketing/promotions/APP200", "PUT", gift))
          .status,
        403,
      );
      assert.equal(
        (
          await mobile.call("/auth/register", "POST", {
            name: "Duplicate",
            email: mobile.email,
            password,
            registrationSource: "mobile_app",
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT count(*) FROM promotion_grants WHERE user_id=$1",
            [mobile.id],
          )
        ).rows[0].count,
        "1",
      );
    },
  );
  await t.test(
    "unissued accounts cannot use the shared code; quote does not spend a gift",
    async () => {
      for (const c of [mobile, other, web, anon]) await add(c);
      assert.equal((await web.call("/cart/quote", "POST", quote)).status, 400);
      assert.equal((await anon.call("/cart/quote", "POST", quote)).status, 400);
      const q = await mobile.call("/cart/quote", "POST", quote);
      assert.equal(q.data.discount, 20000);
      assert.equal(q.data.total, 15000);
      assert.equal(
        (await mobile.call("/me/promotions")).data[0].usedByUser,
        false,
      );
      assert.equal(
        (await other.call("/cart/quote", "POST", quote)).data.discount,
        20000,
      );
    },
  );
  await t.test(
    "admin amount changes apply to unspent grants; discount is capped; stopping issuance keeps restrictions",
    async () => {
      assert.equal(
        (
          await admin.call("/admin/marketing/promotions/APP200", "PUT", {
            ...gift,
            amount: 50000,
            registrationGift: false,
          })
        ).status,
        200,
      );
      assert.equal(
        (await mobile.call("/cart/quote", "POST", quote)).data.total,
        0,
      );
      const late = new Client();
      assert.deepEqual(
        (await late.register("late", "mobile_app")).data.registrationPromotions,
        [],
      );
      assert.equal((await web.call("/cart/quote", "POST", quote)).status, 400);
      await web.call("/auth/login", "POST", {
        email: web.email,
        password,
        registrationSource: "mobile_app",
      });
      assert.equal((await web.call("/me/promotions")).data.length, 0);
      assert.equal(
        (
          await admin.call("/admin/marketing/promotions/APP200", "PUT", {
            ...gift,
            enabled: false,
          })
        ).status,
        200,
      );
      assert.equal(
        (await mobile.call("/cart/quote", "POST", quote)).status,
        400,
      );
      await admin.call("/admin/marketing/promotions/APP200", "PUT", gift);
      assert.equal(
        (
          await admin.call("/admin/marketing/promotions/SECOND", "PUT", {
            ...gift,
            code: "SECOND",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await admin.call("/admin/marketing/promotions/APP200", "PUT", {
            ...gift,
            amount: -100,
          })
        ).status,
        400,
      );
    },
  );
  await t.test(
    "concurrent sessions cannot redeem twice; retry retains original order",
    async () => {
      const second = new Client();
      await second.call("/auth/login", "POST", {
        email: mobile.email,
        password,
      });
      await add(second);
      const keys = [randomUUID(), randomUUID()];
      const results = await Promise.all([
        mobile.call("/orders", "POST", order, keys[0]),
        second.call("/orders", "POST", order, keys[1]),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 400]);
      const i = results.findIndex((r) => r.status === 201),
        winner = i === 0 ? mobile : second;
      const retry = await winner.call("/orders", "POST", order, keys[i]);
      assert.ok([200, 201].includes(retry.status));
      assert.equal(retry.data.id, results[i].data.id);
      assert.equal(
        (await mobile.call("/me/promotions")).data[0].usedByUser,
        true,
      );
      assert.equal(
        (await other.call("/me/promotions")).data[0].available,
        true,
      );
      assert.equal(
        (await pool.query("SELECT used FROM promotions WHERE code='APP200'"))
          .rows[0].used,
        1,
      );
    },
  );
  await t.test(
    "dine-in redemption also consumes the personal gift",
    async () => {
      const tid = randomUUID();
      await pool.query(
        "INSERT INTO qr_tables(id,token,name) VALUES($1,'welcome-qr','Тест')",
        [tid],
      );
      const visit = await admin.call("/admin/v2/visits", "POST", {
        tableId: tid,
      });
      assert.equal(visit.status, 201);
      assert.equal(
        (
          await other.call("/v2/visits/join", "POST", {
            token: "welcome-qr",
            code: visit.data.joinCode,
          })
        ).status,
        200,
      );
      const r = await other.call(
        `/v2/visits/${visit.data.id}/orders`,
        "POST",
        { promo: "APP200" },
        randomUUID(),
      );
      assert.equal(r.status, 201);
      assert.equal(r.data.discount, 20000);
      assert.equal(
        (await other.call("/me/promotions")).data[0].usedByUser,
        true,
      );
    },
  );
});
