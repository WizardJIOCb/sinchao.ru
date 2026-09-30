import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { app } from "../server/app";
import { pool } from "../server/db";
import {
  confirmationUrl,
  onlinePaymentConfig,
  rubleAmount,
  verifyYooPayment,
  YooKassaClient,
  type PaymentIntent,
} from "../server/online-payments";
import { menu, categories, restaurant } from "./fixtures/demo-catalog";

if (
  !new URL(process.env.DATABASE_URL ?? "http://invalid").pathname.endsWith(
    "_test",
  )
)
  throw Error("Isolated _test database required");

const sampleIntent = (): PaymentIntent => ({
  id: randomUUID(),
  visit_id: randomUUID(),
  share_id: randomUUID(),
  bill_share_id: null,
  amount: 35001,
  method: "sbp",
  status: "CREATING",
  provider_id: null,
  provider_key: randomUUID(),
  provider_shop_id: "123456",
  provider_test_mode: true,
  return_url: "https://food.xedoc.ru/dine-in/fixture?payment=fixture",
  confirmation_url: null,
  created_at: new Date(),
  owner: "fixture",
  user_id: null,
});
const providerPayment = (intent: PaymentIntent) => ({
  id: "provider-" + intent.id,
  status: "pending",
  paid: false,
  amount: { value: rubleAmount(intent.amount), currency: "RUB" },
  metadata: {
    payment_intent_id: intent.id,
    visit_id: intent.visit_id,
    share_id: intent.share_id,
  },
  recipient: { account_id: "123456" },
  payment_method: { type: intent.method },
  confirmation: {
    type: "redirect",
    confirmation_url:
      "https://yoomoney.ru/checkout/payments/sbp?orderId=" + intent.id,
  },
  test: true,
});

test("online payment settings fail closed and expose no secrets", () => {
  const valid = {
    YOOKASSA_ENABLED: "true",
    YOOKASSA_RECEIPT_MODE: "external",
    YOOKASSA_SHOP_ID: "123456",
    YOOKASSA_SECRET_KEY: "never-client-secret",
    APP_ORIGIN: "https://food.xedoc.ru",
    DATABASE_URL: "postgresql://host/app_test",
  };
  assert.equal(onlinePaymentConfig({}).available, false);
  assert.equal(onlinePaymentConfig(valid).available, true);
  assert.equal(
    JSON.stringify(onlinePaymentConfig(valid)).includes("never-client-secret"),
    false,
  );
  for (const invalid of [
    { ...valid, YOOKASSA_ENABLED: "false" },
    { ...valid, YOOKASSA_RECEIPT_MODE: undefined },
    { ...valid, YOOKASSA_SECRET_KEY: undefined },
    { ...valid, APP_ORIGIN: "http://food.xedoc.ru" },
    { ...valid, APP_ORIGIN: "https://food.xedoc.ru/path" },
    {
      ...valid,
      YOOKASSA_TEST_MODE: "true",
      DATABASE_URL: "postgresql://host/app",
    },
  ])
    assert.equal(onlinePaymentConfig(invalid).available, false);
});

test("provider verification rejects wrong money, metadata, account, method, sandbox and redirect", () => {
  const intent = sampleIntent();
  const valid = providerPayment(intent);
  assert.equal(verifyYooPayment(valid, intent, "123456", true).id, valid.id);
  assert.equal(rubleAmount(1), "0.01");
  assert.equal(rubleAmount(35001), "350.01");
  assert.throws(() => rubleAmount(-1));
  assert.throws(() => rubleAmount(1.5));
  for (const invalid of [
    { ...valid, amount: { value: "350.00", currency: "RUB" } },
    { ...valid, amount: { value: "350.01", currency: "USD" } },
    { ...valid, metadata: { ...valid.metadata, share_id: randomUUID() } },
    { ...valid, recipient: { account_id: "other" } },
    { ...valid, payment_method: { type: "bank_card" } },
    { ...valid, status: "succeeded", paid: false },
    { ...valid, status: "pending", paid: true },
    { ...valid, test: false },
  ])
    assert.throws(() => verifyYooPayment(invalid, intent, "123456", true));
  for (const url of [
    "http://yoomoney.ru/payment",
    "https://yoomoney.ru.evil.test/",
    "https://evil.test/",
    "https://user:pass@yoomoney.ru/",
    "javascript:alert(1)",
  ])
    assert.throws(() => confirmationUrl(url));
  assert.equal(
    confirmationUrl("https://yookassa.ru/checkout"),
    "https://yookassa.ru/checkout",
  );
});

test("YooKassa transport retries the same durable key and stops before its 24-hour expiry", async () => {
  const intent = sampleIntent();
  const requests: { url: string; init: RequestInit }[] = [];
  const transport = (async (url: string | URL | Request, init: RequestInit) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify(providerPayment(intent)), {
      status: 200,
    });
  }) as typeof fetch;
  const client = new YooKassaClient(
    {
      shopId: "123456",
      secretKey: "test-secret",
      origin: "https://food.xedoc.ru",
      testMode: true,
    },
    transport,
  );
  await client.create(intent);
  await client.create(intent);
  assert.equal(requests.length, 2);
  await assert.rejects(() =>
    client.create({ ...intent, provider_shop_id: "another-shop" }),
  );
  await assert.rejects(() =>
    client.get({
      ...intent,
      provider_test_mode: false,
      provider_id: "old-provider-payment",
    }),
  );
  for (const amount of [99, 70000001])
    await assert.rejects(() => client.create({ ...intent, amount }), {
      code: "PAYMENT_AMOUNT",
    });
  assert.equal(requests.length, 2);
  assert.equal(
    (requests[0].init.headers as any)["Idempotence-Key"],
    intent.provider_key,
  );
  assert.equal(
    (requests[1].init.headers as any)["Idempotence-Key"],
    intent.provider_key,
  );
  assert.equal(requests[0].init.body, requests[1].init.body);
  const body = JSON.parse(String(requests[0].init.body));
  assert.equal(body.capture, true);
  assert.equal(body.payment_method_data.type, "sbp");
  assert.equal(body.receipt, undefined);
  await assert.rejects(() =>
    client.create({
      ...intent,
      created_at: new Date(Date.now() - 24 * 3600000),
    }),
  );
  assert.equal(requests.length, 2);
});

let server: ReturnType<typeof app.listen>, base: string;
const savedFetch = globalThis.fetch;
const environmentKeys = [
  "YOOKASSA_ENABLED",
  "YOOKASSA_SHOP_ID",
  "YOOKASSA_SECRET_KEY",
  "YOOKASSA_RECEIPT_MODE",
  "YOOKASSA_TEST_MODE",
  "APP_ORIGIN",
];
const savedEnvironment = Object.fromEntries(
  environmentKeys.map((key) => [key, process.env[key]]),
);
const tableId = randomUUID(),
  token = "online-payment-fixture-table",
  giftCode = "112233445566AABBCCDDEEFF";
const dish = { ...menu[0], modifiers: [], price: 40000 };
const provider = new Map<string, any>();
const keys = new Map<string, string>();
let creationRequests = 0,
  uniqueCreations = 0,
  getRequests = 0,
  loseNextCreateResponse = false;
let maliciousGet: ((value: any) => any) | undefined;

class Client {
  cookie = "";
  async call(path: string, method = "GET", body?: unknown, key?: string) {
    const r = await savedFetch(base + path, {
      method,
      signal: AbortSignal.timeout(20000),
      headers: {
        "Content-Type": "application/json",
        Cookie: this.cookie,
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const cookie = r.headers.getSetCookie().at(-1);
    if (cookie) this.cookie = cookie.split(";")[0];
    return { status: r.status, ...(await r.json()) };
  }
}
const staff = new Client(),
  guest = new Client(),
  stranger = new Client();

before(async () => {
  process.env.YOOKASSA_ENABLED = "true";
  process.env.YOOKASSA_SHOP_ID = "123456";
  process.env.YOOKASSA_SECRET_KEY = "mock-only-not-a-real-key";
  process.env.YOOKASSA_RECEIPT_MODE = "external";
  process.env.YOOKASSA_TEST_MODE = "false";
  process.env.APP_ORIGIN = "https://food.xedoc.ru";
  globalThis.fetch = (async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    const parsed = new URL(
      typeof url === "string" || url instanceof URL ? url : url.url,
    );
    if (parsed.hostname !== "api.yookassa.ru") return savedFetch(url, init);
    assert.equal(init?.redirect, "error");
    assert.ok((init?.headers as any).Authorization.startsWith("Basic "));
    if (init?.method === "POST") {
      creationRequests++;
      const key = (init.headers as any)["Idempotence-Key"];
      let id = keys.get(key);
      if (!id) {
        uniqueCreations++;
        id = "provider-" + randomUUID();
        keys.set(key, id);
        const body = JSON.parse(String(init.body));
        provider.set(id, {
          id,
          status: "pending",
          paid: false,
          amount: body.amount,
          metadata: body.metadata,
          recipient: { account_id: "123456" },
          test: false,
          payment_method: body.payment_method_data,
          confirmation: {
            type: "redirect",
            confirmation_url:
              "https://yoomoney.ru/checkout/payments?orderId=" + id,
          },
        });
      }
      if (loseNextCreateResponse) {
        loseNextCreateResponse = false;
        throw Error("Simulated lost provider response");
      }
      return new Response(JSON.stringify(provider.get(id)), { status: 200 });
    }
    getRequests++;
    const id = parsed.pathname.split("/").at(-1)!;
    const value = provider.get(id);
    return new Response(
      JSON.stringify(maliciousGet ? maliciousGet(value) : value),
      { status: value ? 200 : 404 },
    );
  }) as typeof fetch;
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
    JSON.stringify({ ...restaurant, demo: false }),
  ]);
  await pool.query(
    "UPDATE v2_settings SET data=jsonb_set(data,'{floorPlanVerified}','true') WHERE id=1",
  );
  await pool.query(
    "INSERT INTO qr_tables(id,token,name) VALUES($1,$2,'Онлайн тестовый стол')",
    [tableId, token],
  );
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}/api`;
  const registration = await staff.call("/auth/register", "POST", {
    name: "Payment test operator",
    email: "payment-operator@online-payments.test",
    password: "isolated-payment-password",
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
  globalThis.fetch = savedFetch;
  for (const key of environmentKeys) {
    if (savedEnvironment[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnvironment[key];
  }
  if (server)
    await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

async function visitWithBill(tip = 4000) {
  const v = await staff.call("/admin/v2/visits", "POST", { tableId });
  assert.equal(v.status, 201, JSON.stringify(v));
  const visitId = v.data.id;
  assert.equal(
    (
      await guest.call("/v2/visits/join", "POST", {
        token,
        code: v.data.joinCode,
      })
    ).status,
    200,
  );
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
  const o = await guest.call(
    `/v2/visits/${visitId}/orders`,
    "POST",
    {},
    randomUUID(),
  );
  assert.equal(o.status, 201, JSON.stringify(o));
  assert.equal(
    (
      await guest.call(`/v2/visits/${visitId}/tip`, "PUT", {
        choice: { kind: tip ? "amount" : "none", value: tip },
        expectedVersion: 0,
      })
    ).status,
    200,
  );
  const split = await guest.call(`/v2/visits/${visitId}/split`, "POST", {
    count: 1,
  });
  assert.equal(split.status, 200, JSON.stringify(split));
  return { visitId, shareId: split.data.shares[0].id, orderId: o.data.id };
}

async function finishVisit(visitId: string, orderId: string) {
  for (const status of ["CONFIRMED", "PREPARING", "READY", "COMPLETED"])
    assert.equal(
      (await staff.call(`/admin/orders/${orderId}/status`, "PATCH", { status }))
        .status,
      200,
    );
  assert.equal(
    (await staff.call(`/admin/v2/visits/${visitId}/close`, "POST", {})).status,
    200,
  );
}

test("table payments verify provider API and protect bill mutations, retries and settlement", async (t) => {
  const bill = await visitWithBill();
  const path = `/payments/visits/${bill.visitId}/shares/${bill.shareId}`;
  let payment: any;
  await t.test(
    "disabled provider is honest; membership is required; gift and tips determine server amount",
    async () => {
      process.env.YOOKASSA_ENABLED = "false";
      assert.equal(
        (await guest.call("/payments/config")).data.available,
        false,
      );
      assert.equal(
        (await guest.call(path, "POST", { method: "bank_card", amount: 1 }))
          .status,
        503,
      );
      assert.equal(creationRequests, 0);
      assert.equal(
        (await stranger.call(path, "POST", { method: "bank_card" })).status,
        404,
      );
      process.env.YOOKASSA_ENABLED = "true";
      await pool.query(
        "UPDATE restaurant SET data=jsonb_set(data,'{demo}','true') WHERE id=1",
      );
      assert.equal(
        (await guest.call("/payments/config")).data.available,
        false,
      );
      const demoBlocked = await guest.call(path, "POST", {
        method: "bank_card",
      });
      assert.equal(demoBlocked.status, 409);
      assert.equal(demoBlocked.error.code, "DEMO_PAYMENT_DISABLED");
      assert.equal(creationRequests, 0);
      await pool.query(
        "UPDATE restaurant SET data=jsonb_set(data,'{demo}','false') WHERE id=1",
      );
      const gift = await staff.call(
        "/admin/v2/gifts/redeem",
        "POST",
        { code: giftCode, shareId: bill.shareId, amount: 10000 },
        randomUUID(),
      );
      assert.equal(gift.status, 200, JSON.stringify(gift));
      const created = await guest.call(path, "POST", {
        method: "bank_card",
        amount: 1,
        currency: "USD",
      });
      assert.equal(created.status, 201, JSON.stringify(created));
      payment = created.data;
      assert.equal(payment.amount, 34000); // 400 RUB food + 40 RUB tip - 100 RUB gift
      assert.equal(payment.status, "PENDING");
      assert.equal(uniqueCreations, 1);
      assert.equal(getRequests, 1);
      const stored = (
        await pool.query("SELECT * FROM table_payments WHERE id=$1", [
          payment.id,
        ])
      ).rows[0];
      assert.equal(new URL(stored.return_url).origin, "https://food.xedoc.ru");
      assert.equal(new URL(stored.return_url).pathname, `/dine-in/${token}`);
      assert.equal(
        new URL(stored.return_url).searchParams.get("payment"),
        payment.id,
      );
      assert.equal(
        (await stranger.call(`/payments/visits/${bill.visitId}/payments`))
          .status,
        404,
      );
      assert.equal(
        (
          await stranger.call(
            `/payments/visits/${bill.visitId}/payments/${payment.id}/sync`,
            "POST",
            {},
          )
        ).status,
        404,
      );
    },
  );
  await t.test(
    "concurrent create resumes one provider payment; pending prevents cash, gifts, reset and close",
    async () => {
      const repeated = await Promise.all([
        guest.call(path, "POST", { method: "bank_card" }),
        guest.call(path, "POST", { method: "bank_card" }),
      ]);
      for (const r of repeated) {
        assert.equal(r.status, 201, JSON.stringify(r));
        assert.equal(r.data.id, payment.id);
      }
      assert.equal(uniqueCreations, 1);
      assert.equal(
        (await guest.call(path, "POST", { method: "sbp" })).status,
        409,
      );
      for (const [route, method, body] of [
        [
          `/admin/v2/visits/${bill.visitId}/shares/${bill.shareId}/pay`,
          "POST",
          {},
        ],
        [`/admin/v2/visits/${bill.visitId}/split`, "DELETE", {}],
        [`/admin/v2/visits/${bill.visitId}/close`, "POST", {}],
        [
          "/admin/v2/gifts/redeem",
          "POST",
          { code: giftCode, shareId: bill.shareId, amount: 100 },
        ],
      ] as const) {
        const result = await staff.call(route, method, body, randomUUID());
        assert.equal(result.status, 409, JSON.stringify(result));
        assert.equal(result.error.code, "ONLINE_PAYMENT_PENDING");
      }
    },
  );
  await t.test(
    "forged succeeded webhook and mismatched authoritative amount never settle",
    async () => {
      const stored = (
        await pool.query("SELECT provider_id FROM table_payments WHERE id=$1", [
          payment.id,
        ])
      ).rows[0];
      const forged = {
        type: "notification",
        event: "payment.succeeded",
        object: {
          id: stored.provider_id,
          status: "succeeded",
          paid: true,
          amount: { value: "340.00", currency: "RUB" },
        },
      };
      const hook = await guest.call(
        "/payments/yookassa/webhook",
        "POST",
        forged,
      );
      assert.equal(hook.status, 200, JSON.stringify(hook));
      assert.equal(
        (
          await pool.query("SELECT paid FROM bill_shares WHERE id=$1", [
            bill.shareId,
          ])
        ).rows[0].paid,
        false,
      );
      maliciousGet = (v) => ({
        ...v,
        status: "succeeded",
        paid: true,
        amount: { value: "1.00", currency: "RUB" },
      });
      const sync = await guest.call(
        `/payments/visits/${bill.visitId}/payments/${payment.id}/sync`,
        "POST",
        {},
      );
      assert.equal(sync.status, 502);
      maliciousGet = undefined;
      assert.equal(
        (
          await pool.query("SELECT paid FROM bill_shares WHERE id=$1", [
            bill.shareId,
          ])
        ).rows[0].paid,
        false,
      );
    },
  );
  await t.test(
    "authoritative success settles once through concurrent sync and webhook",
    async () => {
      const stored = (
        await pool.query("SELECT provider_id FROM table_payments WHERE id=$1", [
          payment.id,
        ])
      ).rows[0];
      Object.assign(provider.get(stored.provider_id), {
        status: "succeeded",
        paid: true,
      });
      const results = await Promise.all([
        guest.call(
          `/payments/visits/${bill.visitId}/payments/${payment.id}/sync`,
          "POST",
          {},
        ),
        guest.call("/payments/yookassa/webhook", "POST", {
          type: "notification",
          event: "payment.succeeded",
          object: { id: stored.provider_id },
        }),
      ]);
      assert.ok(
        results.every((r) => r.status === 200),
        JSON.stringify(results),
      );
      assert.equal(
        (
          await pool.query("SELECT paid FROM bill_shares WHERE id=$1", [
            bill.shareId,
          ])
        ).rows[0].paid,
        true,
      );
      assert.equal(
        (
          await pool.query("SELECT payment_status FROM orders WHERE id=$1", [
            bill.orderId,
          ])
        ).rows[0].payment_status,
        "PAID",
      );
      assert.equal(
        Number(
          (
            await pool.query(
              "SELECT count(*) FROM audit_logs WHERE action='BILL_SHARE_PAID_ONLINE' AND entity_id=$1",
              [bill.shareId],
            )
          ).rows[0].count,
        ),
        1,
      );
      assert.equal(
        Number(
          (
            await pool.query(
              "SELECT count(*) FROM notifications WHERE title='Счёт оплачен' AND reference_id=$1",
              [bill.visitId],
            )
          ).rows[0].count,
        ),
        1,
      );
      const replay = await guest.call(path, "POST", { method: "bank_card" });
      assert.equal(replay.data.status, "SUCCEEDED");
      assert.equal(uniqueCreations, 1);
      await finishVisit(bill.visitId, bill.orderId);
    },
  );

  await t.test(
    "lost create response retains key and lock; retry cannot charge twice; cancellation unlocks cash",
    async () => {
      const next = await visitWithBill();
      const nextPath = `/payments/visits/${next.visitId}/shares/${next.shareId}`;
      loseNextCreateResponse = true;
      const lost = await guest.call(nextPath, "POST", { method: "sbp" });
      assert.equal(lost.status, 502);
      const row = (
        await pool.query("SELECT * FROM table_payments WHERE share_id=$1", [
          next.shareId,
        ])
      ).rows[0];
      assert.equal(row.status, "CREATING");
      assert.equal(row.provider_id, null);
      const cash = await staff.call(
        `/admin/v2/visits/${next.visitId}/shares/${next.shareId}/pay`,
        "POST",
        {},
      );
      assert.equal(cash.status, 409);
      const retry = await guest.call(nextPath, "POST", { method: "sbp" });
      assert.equal(retry.status, 201, JSON.stringify(retry));
      assert.equal(retry.data.id, row.id);
      assert.equal(uniqueCreations, 2);
      const id = (
        await pool.query("SELECT provider_id FROM table_payments WHERE id=$1", [
          row.id,
        ])
      ).rows[0].provider_id;
      Object.assign(provider.get(id), { status: "canceled", paid: false });
      const sync = await guest.call(
        `/payments/visits/${next.visitId}/payments/${row.id}/sync`,
        "POST",
        {},
      );
      assert.equal(sync.data.status, "CANCELED");
      assert.equal(
        (
          await staff.call(
            `/admin/v2/visits/${next.visitId}/shares/${next.shareId}/pay`,
            "POST",
            {},
          )
        ).status,
        200,
      );
      await finishVisit(next.visitId, next.orderId);
    },
  );
  await t.test(
    "sub-ruble SBP remainder after a certificate creates no intent and leaves cash available",
    async () => {
      const tiny = await visitWithBill(0);
      const gift = await staff.call(
        "/admin/v2/gifts/redeem",
        "POST",
        {
          code: giftCode,
          shareId: tiny.shareId,
          amount: 39941,
        },
        randomUUID(),
      );
      assert.equal(gift.status, 200, JSON.stringify(gift));
      const requestsBefore = creationRequests;
      const response = await guest.call(
        `/payments/visits/${tiny.visitId}/shares/${tiny.shareId}`,
        "POST",
        { method: "sbp" },
      );
      assert.equal(response.status, 400, JSON.stringify(response));
      assert.equal(response.error.code, "PAYMENT_AMOUNT");
      assert.equal(creationRequests, requestsBefore);
      assert.equal(
        (
          await pool.query("SELECT id FROM table_payments WHERE share_id=$1", [
            tiny.shareId,
          ])
        ).rowCount,
        0,
      );
      const cash = await staff.call(
        `/admin/v2/visits/${tiny.visitId}/shares/${tiny.shareId}/pay`,
        "POST",
        {},
      );
      assert.equal(cash.status, 200, JSON.stringify(cash));
      await finishVisit(tiny.visitId, tiny.orderId);
    },
  );
});
