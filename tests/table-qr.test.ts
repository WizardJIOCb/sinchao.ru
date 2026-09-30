import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { app } from "../server/app";
import { pool } from "../server/db";
import { categories, menu, restaurant } from "./fixtures/demo-catalog";

if (
  !new URL(process.env.DATABASE_URL ?? "http://invalid").pathname.endsWith(
    "_test",
  )
)
  throw Error("Isolated _test database required");

let server: ReturnType<typeof app.listen>, base: string;
const tableA = randomUUID(),
  tableB = randomUUID(),
  inactiveTable = randomUUID(),
  tokenA = "qr-regression-table-a",
  tokenB = "qr-regression-table-b",
  inactiveToken = "qr-regression-inactive",
  giftCode = "AABBCCDDEEFF001122334455";
const dish = { ...menu[0], price: 42000, modifiers: [] };

class Client {
  cookie = "";
  async call(path: string, method = "GET", body?: unknown, key?: string) {
    const response = await fetch(base + path, {
      signal: AbortSignal.timeout(15000),
      method,
      headers: {
        "Content-Type": "application/json",
        Cookie: this.cookie,
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const cookie = response.headers.getSetCookie().at(-1);
    if (cookie) this.cookie = cookie.split(";")[0];
    return { status: response.status, ...(await response.json()) };
  }
}
const staff = new Client(),
  guest = new Client(),
  stranger = new Client();
const scan = (client: Client, token: string) =>
  client.call("/v2/visit?token=" + encodeURIComponent(token));
async function addAndOrder(client: Client, visitId: string) {
  const add = await client.call("/cart/items", "POST", {
    dishId: dish.id,
    quantity: 1,
    modifiers: [],
  });
  assert.equal(add.status, 200, JSON.stringify(add));
  const order = await client.call(
    `/v2/visits/${visitId}/orders`,
    "POST",
    {},
    randomUUID(),
  );
  assert.equal(order.status, 201, JSON.stringify(order));
  return order.data;
}
async function openVisit(tableId: string) {
  const response = await staff.call("/admin/v2/visits", "POST", { tableId });
  assert.equal(response.status, 201, JSON.stringify(response));
  return response.data;
}
async function join(client: Client, token: string, code: string) {
  const response = await client.call("/v2/visits/join", "POST", {
    token,
    code,
  });
  assert.equal(response.status, 200, JSON.stringify(response));
  assert.equal(response.data.joinCode, undefined);
  return response.data;
}
async function completeOrder(orderId: string) {
  for (const status of ["CONFIRMED", "PREPARING", "READY", "COMPLETED"]) {
    const response = await staff.call(
      `/admin/orders/${orderId}/status`,
      "PATCH",
      {
        status,
      },
    );
    assert.equal(response.status, 200, JSON.stringify(response));
  }
}

before(async () => {
  await pool.query(
    "TRUNCATE audit_logs,notifications,loyalty_transactions,reservations,orders,sessions,users,analytics,qr_tables,restaurant_events,promotions,dish_achievement_rules,general_achievement_rules RESTART IDENTITY CASCADE",
  );
  await pool.query("DELETE FROM dishes");
  await pool.query("DELETE FROM categories");
  for (const [position, category] of categories.entries())
    await pool.query(
      "INSERT INTO categories(id,data,position) VALUES($1,$2,$3)",
      [category.id, JSON.stringify(category), position],
    );
  await pool.query("INSERT INTO dishes(id,data,position) VALUES($1,$2,0)", [
    dish.id,
    JSON.stringify(dish),
  ]);
  await pool.query("UPDATE restaurant SET data=$1 WHERE id=1", [
    JSON.stringify({ ...restaurant, demo: true, orderingEnabled: true }),
  ]);
  await pool.query(
    "INSERT INTO qr_tables(id,token,name,active) VALUES($1,$2,'QR стол А',true),($3,$4,'QR стол Б',true),($5,$6,'Неактивный стол',false)",
    [tableA, tokenA, tableB, tokenB, inactiveTable, inactiveToken],
  );
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}/api`;
  const registration = await staff.call("/auth/register", "POST", {
    name: "QR сотрудник",
    email: "qr-staff@table-qr.test",
    password: "isolated-qr-test-password",
    phone: "+79000000000",
  });
  assert.equal(registration.status, 201, JSON.stringify(registration));
  await pool.query("UPDATE users SET role='ADMIN' WHERE id=$1", [
    registration.data.id,
  ]);
  await pool.query(
    "INSERT INTO gift_certificates(id,buyer_id,code,amount,balance,status,idempotency_key,expires_at) VALUES($1,$2,$3,500000,500000,'ACTIVE',$4,now()+interval '1 year')",
    [randomUUID(), registration.data.id, giftCode, randomUUID()],
  );
  await guest.call("/me");
  await stranger.call("/me");
});

after(async () => {
  if (server)
    await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

test("printed table QR keeps guest actions and payment state on the scanned table", async (t) => {
  const visitA = await openVisit(tableA);
  let visitB: any;
  let ordersB: any[];

  await t.test(
    "unknown and inactive QR fail clearly before exposing a visit",
    async () => {
      for (const token of ["unknown-table-token", inactiveToken]) {
        const response = await scan(guest, token);
        assert.equal(response.status, 404);
        assert.equal(response.error.code, "QR_NOT_FOUND");
        assert.equal(response.data, null);
        assert.equal((await guest.call("/dine-in/" + token)).status, 404);
      }
      assert.equal((await guest.call("/v2/visit?token=")).status, 400);
      assert.equal(
        (await guest.call("/v2/visit?token=bad&token=other")).status,
        400,
      );
      assert.equal((await guest.call("/dine-in/" + tokenA)).status, 200);
    },
  );

  await t.test(
    "scan B cannot inherit A even when the guest has several visits",
    async () => {
      await join(guest, tokenA, visitA.joinCode);
      assert.equal((await scan(guest, tokenA)).data.id, visitA.id);
      assert.equal((await scan(guest, tokenB)).data, null);
      assert.equal((await guest.call("/v2/visit")).data.id, visitA.id);
      visitB = await openVisit(tableB);
      assert.equal((await scan(guest, tokenB)).data, null);
      assert.equal((await scan(stranger, tokenA)).data, null);
      assert.equal(
        (await stranger.call(`/v2/visits/${visitA.id}`)).status,
        404,
      );
      const wrongCode = await stranger.call("/v2/visits/join", "POST", {
        token: tokenB,
        code: "000000",
      });
      assert.equal(wrongCode.status, 403);
      await join(guest, tokenB, visitB.joinCode);
      assert.equal((await scan(guest, tokenA)).data.id, visitA.id);
      assert.equal((await scan(guest, tokenB)).data.id, visitB.id);
      assert.equal((await guest.call("/v2/visit")).data.id, visitB.id);
      assert.equal((await guest.call("/me")).data.user, null);
    },
  );

  await t.test(
    "anonymous waiter and bill requests deduplicate on the target visit",
    async () => {
      const calls = await Promise.all([
        guest.call(`/v2/visits/${visitB.id}/call`, "POST", { kind: "WAITER" }),
        guest.call(`/v2/visits/${visitB.id}/call`, "POST", { kind: "WAITER" }),
        guest.call(`/v2/visits/${visitB.id}/call`, "POST", { kind: "BILL" }),
      ]);
      assert.ok(calls.every((response) => response.status === 200));
      const current = (await scan(guest, tokenB)).data;
      assert.equal(
        current.calls.filter((call: any) => call.kind === "WAITER").length,
        1,
      );
      assert.equal(
        current.calls.filter((call: any) => call.kind === "BILL").length,
        1,
      );
      assert.equal((await scan(guest, tokenA)).data.calls.length, 0);
      assert.equal(
        (
          await stranger.call(`/v2/visits/${visitB.id}/call`, "POST", {
            kind: "WAITER",
          })
        ).status,
        404,
      );
    },
  );

  await t.test(
    "anonymous initial order and additional order submit once to B",
    async () => {
      assert.equal(
        (
          await guest.call("/cart/items", "POST", {
            dishId: dish.id,
            quantity: 1,
            modifiers: [],
          })
        ).status,
        200,
      );
      const key = randomUUID();
      const results = await Promise.all([
        guest.call(`/v2/visits/${visitB.id}/orders`, "POST", {}, key),
        guest.call(`/v2/visits/${visitB.id}/orders`, "POST", {}, key),
      ]);
      assert.ok(results.every((response) => response.status === 201));
      assert.equal(results[0].data.id, results[1].data.id);
      assert.equal(results[0].data.visitId, visitB.id);
      assert.equal((await guest.call("/cart")).data.length, 0);
      const extra = await addAndOrder(guest, visitB.id);
      ordersB = [results[0].data, extra];
      assert.equal((await scan(guest, tokenB)).data.orders.length, 2);
      assert.equal((await scan(guest, tokenA)).data.orders.length, 0);
      const conflict = await guest.call(
        `/v2/visits/${visitA.id}/orders`,
        "POST",
        {},
        key,
      );
      assert.equal(conflict.status, 409);
      assert.equal(conflict.error.code, "IDEMPOTENCY_CONFLICT");
    },
  );

  await t.test(
    "unsplit bill reports legacy payments and excludes cancelled orders",
    async () => {
      const first = await addAndOrder(guest, visitA.id);
      const cancelled = await addAndOrder(guest, visitA.id);
      assert.equal((await scan(guest, tokenA)).data.paid, 0);
      // Legacy partial order payment is included without double counting a later receipt.
      await pool.query("UPDATE orders SET gift_paid=1000 WHERE id=$1", [
        first.id,
      ]);
      assert.equal((await scan(guest, tokenA)).data.paid, 1000);
      assert.equal(
        (await guest.call(`/orders/${cancelled.id}/cancel`, "POST", {})).status,
        200,
      );
      await pool.query("UPDATE orders SET gift_paid=500 WHERE id=$1", [
        cancelled.id,
      ]);
      assert.equal((await scan(guest, tokenA)).data.paid, 1000);
      const denied = await guest.call(
        `/admin/orders/${first.id}/payment`,
        "POST",
        {},
      );
      assert.equal(denied.status, 403);
      const payment = await staff.call(
        `/admin/orders/${first.id}/payment`,
        "POST",
        {},
      );
      assert.equal(payment.status, 409, JSON.stringify(payment));
      assert.equal(payment.error.code, "TABLE_BILL");
      await pool.query("UPDATE orders SET payment_status='PAID' WHERE id=$1", [
        first.id,
      ]);
      const current = (await scan(guest, tokenA)).data;
      assert.equal(current.total, dish.price);
      assert.equal(current.paid, dish.price);
      assert.equal(current.shares.length, 0);
      await completeOrder(first.id);
    },
  );

  await t.test(
    "bill split locks additional orders and only staff confirms payment",
    async () => {
      const split = await guest.call(`/v2/visits/${visitB.id}/split`, "POST", {
        count: 2,
      });
      assert.equal(split.status, 200, JSON.stringify(split));
      assert.equal(split.data.shares.length, 2);
      assert.equal(
        split.data.shares.reduce(
          (sum: number, share: any) => sum + share.amount,
          0,
        ),
        dish.price * 2,
      );
      const [first, second] = split.data.shares;
      assert.equal(
        (
          await guest.call(
            `/admin/v2/visits/${visitB.id}/shares/${first.id}/pay`,
            "POST",
            {},
          )
        ).status,
        403,
      );
      const partialGift = await staff.call(
        "/admin/v2/gifts/redeem",
        "POST",
        {
          code: giftCode,
          shareId: first.id,
          amount: 1000,
        },
        randomUUID(),
      );
      assert.equal(partialGift.status, 200, JSON.stringify(partialGift));
      assert.equal((await scan(guest, tokenB)).data.paid, 1000);
      const firstPayment = await staff.call(
        `/admin/v2/visits/${visitB.id}/shares/${first.id}/pay`,
        "POST",
        {},
      );
      assert.equal(firstPayment.status, 200, JSON.stringify(firstPayment));
      assert.equal(firstPayment.data.paid, first.amount);
      assert.equal(
        (await staff.call(`/admin/v2/visits/${visitB.id}/close`, "POST", {}))
          .status,
        409,
      );
      await guest.call("/cart/items", "POST", {
        dishId: dish.id,
        quantity: 1,
        modifiers: [],
      });
      const lockedOrder = await guest.call(
        `/v2/visits/${visitB.id}/orders`,
        "POST",
        {},
        randomUUID(),
      );
      assert.equal(lockedOrder.status, 409);
      assert.equal(lockedOrder.error.code, "BILL_LOCKED");
      assert.equal((await guest.call("/cart")).data.length, 1);
      assert.equal(
        (
          await staff.call(
            `/admin/v2/visits/${visitB.id}/shares/${second.id}/pay`,
            "POST",
            {},
          )
        ).status,
        200,
      );
      assert.equal((await scan(guest, tokenB)).data.paid, dish.price * 2);
      for (const order of ordersB) await completeOrder(order.id);
      await guest.call("/cart", "DELETE", {});
    },
  );

  await t.test(
    "closing visit revokes old actions and reused printed QR needs fresh membership",
    async () => {
      assert.equal(
        (await staff.call(`/admin/v2/visits/${visitB.id}/close`, "POST", {}))
          .status,
        200,
      );
      assert.equal((await scan(guest, tokenB)).data, null);
      assert.equal(
        (await guest.call(`/v2/visits/${visitB.id}`)).error.code,
        "VISIT_CLOSED",
      );
      assert.equal(
        (
          await guest.call(`/v2/visits/${visitB.id}/call`, "POST", {
            kind: "WAITER",
          })
        ).error.code,
        "VISIT_CLOSED",
      );
      assert.equal(
        (
          await guest.call("/v2/visits/join", "POST", {
            token: tokenB,
            code: visitB.joinCode,
          })
        ).status,
        403,
      );
      const reopened = await openVisit(tableB);
      assert.notEqual(reopened.id, visitB.id);
      assert.equal((await scan(guest, tokenB)).data, null);
      assert.equal((await guest.call(`/v2/visits/${reopened.id}`)).status, 404);
      assert.equal((await guest.call("/v2/visit")).data.id, visitA.id);
      const joined = await join(guest, tokenB, reopened.joinCode);
      assert.equal(joined.id, reopened.id);
      assert.equal(joined.orders.length, 0);
      assert.equal(joined.calls.length, 0);
      assert.equal((await scan(guest, tokenB)).data.id, reopened.id);
    },
  );
});
