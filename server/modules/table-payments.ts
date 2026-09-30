import { randomUUID } from "node:crypto";
import { Router, type RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { pool, transaction } from "../db";
import { config, fail } from "../lib";
import { owner } from "./auth";
import { member } from "./dine-in";
import {
  assertOnlinePaymentAmount,
  confirmationUrl,
  onlinePaymentConfig,
  paymentView,
  requireYooKassa,
  settleVerifiedTablePayment,
  type PaymentIntent,
  type VerifiedYooPayment,
  type YooKassaClient,
} from "../online-payments";

export const tablePaymentRouter = Router();
tablePaymentRouter.get("/config", async (_req, res) => {
  const available = onlinePaymentConfig();
  if (
    available.available &&
    !requireYooKassa().settings.testMode &&
    (await config(pool)).demo
  ) {
    available.available = false;
    available.methods = [];
    available.message =
      "В тестовом режиме ресторана онлайн-оплата отключена. Обратитесь к официанту.";
  }
  res.json({ data: available, error: null });
});

const customerLimit = rateLimit({
  windowMs: 60000,
  limit: 120,
  keyGenerator: (req) => owner(req),
});
tablePaymentRouter.use("/visits", customerLimit);

tablePaymentRouter.get("/visits/:id/payments", async (req, res) => {
  const visitId = z.uuid().parse(req.params.id);
  await member(pool, req, visitId);
  const rows = (
    await pool.query(
      "SELECT * FROM table_payments WHERE visit_id=$1 ORDER BY created_at DESC",
      [visitId],
    )
  ).rows as PaymentIntent[];
  res.json({ data: rows.map(paymentView), error: null });
});

// Persist the provider identity before requesting the authoritative status. If
// the GET fails, retrying sync addresses the same payment, never a new charge.
async function rememberCreated(
  intent: PaymentIntent,
  created: VerifiedYooPayment,
): Promise<PaymentIntent> {
  return transaction(async (db) => {
    await db.query("SELECT id FROM dine_visits WHERE id=$1 FOR UPDATE", [
      intent.visit_id,
    ]);
    const current = (
      await db.query("SELECT * FROM table_payments WHERE id=$1 FOR UPDATE", [
        intent.id,
      ])
    ).rows[0] as PaymentIntent;
    if (current.provider_id && current.provider_id !== created.id)
      fail(
        502,
        "PAYMENT_PROVIDER_MISMATCH",
        "ЮKassa вернула другую попытку оплаты.",
      );
    if (current.status === "SUCCEEDED" || current.status === "CANCELED")
      return current;
    return (
      await db.query(
        "UPDATE table_payments SET provider_id=$2,confirmation_url=$3,updated_at=now() WHERE id=$1 RETURNING *",
        [
          current.id,
          created.id,
          confirmationUrl(created.confirmation?.confirmation_url),
        ],
      )
    ).rows[0] as PaymentIntent;
  });
}

async function synchronize(
  intent: PaymentIntent,
  client: YooKassaClient,
): Promise<PaymentIntent> {
  if (intent.status === "SUCCEEDED" || intent.status === "CANCELED")
    return intent;
  if (!intent.provider_id)
    intent = await rememberCreated(intent, await client.create(intent));
  const verified = await client.get(intent);
  return transaction(async (db) => {
    await db.query("SELECT id FROM dine_visits WHERE id=$1 FOR UPDATE", [
      intent.visit_id,
    ]);
    const current = (
      await db.query("SELECT * FROM table_payments WHERE id=$1 FOR UPDATE", [
        intent.id,
      ])
    ).rows[0] as PaymentIntent;
    if (!current) fail(404, "PAYMENT_NOT_FOUND", "Попытка оплаты не найдена.");
    return settleVerifiedTablePayment(db, current, verified);
  });
}

tablePaymentRouter.post("/visits/:id/shares/:shareId", async (req, res) => {
  const visitId = z.uuid().parse(req.params.id);
  const shareId = z.uuid().parse(req.params.shareId);
  const method = z.enum(["bank_card", "sbp"]).parse(req.body.method);
  // Authorization is checked even when the integration is disabled.
  await member(pool, req, visitId);
  const client = requireYooKassa();
  const intent = await transaction(async (db) => {
    const visit = await member(db, req, visitId, true);
    if (
      !client.settings.testMode &&
      ((await config(db)).demo ||
        (
          await db.query(
            "SELECT id FROM orders WHERE visit_id=$1 AND status<>'CANCELLED' AND (data->>'demo')::boolean IS TRUE LIMIT 1",
            [visitId],
          )
        ).rowCount)
    )
      fail(
        409,
        "DEMO_PAYMENT_DISABLED",
        "Тестовый счёт нельзя оплачивать настоящими деньгами. Обратитесь к официанту.",
      );
    const share = (
      await db.query(
        "SELECT * FROM bill_shares WHERE id=$1 AND visit_id=$2 FOR UPDATE",
        [shareId, visitId],
      )
    ).rows[0];
    if (!share) fail(404, "SHARE_NOT_FOUND", "Часть счёта не найдена.");
    const old = (
      await db.query(
        "SELECT * FROM table_payments WHERE share_id=$1 AND status IN ('CREATING','PENDING','WAITING_FOR_CAPTURE','SUCCEEDED') ORDER BY created_at DESC LIMIT 1",
        [shareId],
      )
    ).rows[0] as PaymentIntent | undefined;
    if (old) {
      if (old.status !== "SUCCEEDED" && old.method !== method)
        fail(
          409,
          "ONLINE_PAYMENT_PENDING",
          "Для этой части счёта уже начата оплата. Продолжите её или дождитесь отмены ЮKassa.",
        );
      return old;
    }
    if (share.paid || share.amount - share.gift_paid <= 0)
      fail(409, "SHARE_PAID", "Эта часть счёта уже оплачена.");
    assertOnlinePaymentAmount(share.amount - share.gift_paid, method);
    const table = (
      await db.query("SELECT token FROM qr_tables WHERE id=$1", [
        visit.table_id,
      ])
    ).rows[0];
    const id = randomUUID();
    const returnUrl = new URL(
      `/dine-in/${encodeURIComponent(table.token)}`,
      client.settings.origin,
    );
    returnUrl.searchParams.set("payment", id);
    return (
      await db.query(
        "INSERT INTO table_payments(id,visit_id,share_id,bill_share_id,owner,user_id,amount,method,provider_key,return_url,provider_shop_id,provider_test_mode) VALUES($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *",
        [
          id,
          visitId,
          shareId,
          owner(req),
          req.session.user?.id ?? null,
          share.amount - share.gift_paid,
          method,
          randomUUID(),
          returnUrl.href,
          client.settings.shopId,
          client.settings.testMode ?? false,
        ],
      )
    ).rows[0] as PaymentIntent;
  });
  res.status(201).json({
    data: paymentView(await synchronize(intent, client)),
    error: null,
  });
});

tablePaymentRouter.post(
  "/visits/:id/payments/:paymentId/sync",
  async (req, res) => {
    const visitId = z.uuid().parse(req.params.id);
    const id = z.uuid().parse(req.params.paymentId);
    await member(pool, req, visitId);
    const row = (
      await pool.query(
        "SELECT * FROM table_payments WHERE id=$1 AND visit_id=$2",
        [id, visitId],
      )
    ).rows[0] as PaymentIntent;
    if (!row) fail(404, "PAYMENT_NOT_FOUND", "Попытка оплаты не найдена.");
    res.json({
      data: paymentView(await synchronize(row, requireYooKassa())),
      error: null,
    });
  },
);

// Mounted before sessions/CSRF by app.ts. The unauthenticated notification is
// only a prompt to GET the payment through the authenticated provider API.
export const yooKassaWebhook: RequestHandler = async (req, res) => {
  if (!onlinePaymentConfig().available) {
    res.json({ data: { ok: true }, error: null });
    return;
  }
  const input = z
    .object({
      type: z.literal("notification"),
      event: z.enum([
        "payment.succeeded",
        "payment.canceled",
        "payment.waiting_for_capture",
      ]),
      object: z.object({
        id: z.string().regex(/^[a-zA-Z0-9-]{1,100}$/),
        metadata: z
          .object({ payment_intent_id: z.uuid().optional() })
          .optional(),
      }),
    })
    .safeParse(req.body);
  if (!input.success) {
    res.status(400).json({
      data: null,
      error: {
        code: "PAYMENT_NOTIFICATION",
        message: "Некорректное уведомление.",
      },
    });
    return;
  }
  const row = (
    await pool.query(
      "SELECT * FROM table_payments WHERE provider_id=$1 OR (provider_id IS NULL AND id=$2) LIMIT 1",
      [
        input.data.object.id,
        input.data.object.metadata?.payment_intent_id ?? null,
      ],
    )
  ).rows[0] as PaymentIntent | undefined;
  if (row && row.status !== "SUCCEEDED" && row.status !== "CANCELED") {
    const client = requireYooKassa();
    const verified = await client.get({
      ...row,
      provider_id: input.data.object.id,
    });
    await transaction(async (db) => {
      await db.query("SELECT id FROM dine_visits WHERE id=$1 FOR UPDATE", [
        row.visit_id,
      ]);
      const current = (
        await db.query("SELECT * FROM table_payments WHERE id=$1 FOR UPDATE", [
          row.id,
        ])
      ).rows[0] as PaymentIntent;
      await settleVerifiedTablePayment(db, current, verified);
    });
  }
  res.json({ data: { ok: true }, error: null });
};
