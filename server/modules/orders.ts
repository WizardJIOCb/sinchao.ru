import { Router, type Request } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool, transaction, type DB } from "../db";
import { audit, balance, config, dishes, fail, hash, notify } from "../lib";
import { checkoutSchema } from "../validation";
import { owner } from "./auth";
import { priceCart, validateFulfillment } from "./pricing";
import { payOnReceipt } from "./payments";
import { checkBillUnlocked, rewardReferral } from "./v2-core";
import { resolvePromotion } from "./marketing";
import { consumePromotion } from "../registration-promotions";
import {
  orderLabels,
  type CartItem,
  type Fulfillment,
} from "../../shared/types";
export const idempotency = (req: Request) =>
  z
    .string()
    .uuid("Требуется ключ запроса. Обновите страницу.")
    .parse(req.headers["idempotency-key"]);
export const orderView = (r: any) => ({
  ...r.data,
  id: r.id,
  number: Number(r.number),
  status: r.status,
  paymentStatus: r.payment_status,
  createdAt: r.created_at,
  visitId: r.visit_id,
  giftPaid: r.gift_paid ?? 0,
});
export async function ownedOrder(
  db: DB,
  req: Request,
  id: string,
  lock = false,
) {
  z.uuid().parse(id);
  const row = (
    await db.query(
      `SELECT * FROM orders WHERE id=$1 AND (owner=$2 OR user_id=$3) ${lock ? "FOR UPDATE" : ""}`,
      [id, owner(req), req.session.user?.id ?? null],
    )
  ).rows[0];
  if (!row) fail(404, "NOT_FOUND", "Заказ не найден.");
  return row;
}
export function nextStates(status: string, fulfillment: Fulfillment) {
  const map: Record<string, string[]> = {
    CREATED: ["CONFIRMED", "CANCELLED"],
    CONFIRMED: ["PREPARING", "CANCELLED"],
    PREPARING: ["READY"],
    READY: fulfillment === "DELIVERY" ? ["OUT_FOR_DELIVERY"] : ["COMPLETED"],
    OUT_FOR_DELIVERY: ["DELIVERED"],
    DELIVERED: ["COMPLETED"],
    COMPLETED: [],
    CANCELLED: [],
  };
  return map[status] ?? [];
}
export async function returnPoints(db: DB, row: any) {
  if (!row.user_id || !row.data.loyaltyDiscount) return;
  await db.query(
    "INSERT INTO loyalty_transactions(id,user_id,points,type,reference_id,description) VALUES($1,$2,$3,'REFUND',$4,'Возврат бонусов за отменённый заказ') ON CONFLICT DO NOTHING",
    [randomUUID(), row.user_id, row.data.loyaltyDiscount / 100, row.id],
  );
}
export const ordersRouter = Router();
ordersRouter.get("/", async (req, res) => {
  const r = await pool.query(
    "SELECT * FROM orders WHERE owner=$1 OR user_id=$2 ORDER BY created_at DESC LIMIT 100",
    [owner(req), req.session.user?.id ?? null],
  );
  res.json({ data: r.rows.map(orderView), error: null });
});
ordersRouter.get("/:id", async (req, res) =>
  res.json({
    data: orderView(await ownedOrder(pool, req, req.params.id)),
    error: null,
  }),
);
ordersRouter.post("/", async (req, res) => {
  const key = idempotency(req),
    input = checkoutSchema.parse(req.body),
    requestHash = hash(JSON.stringify(input));
  const row = await transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [owner(req)]);
    const existing = (
      await db.query(
        "SELECT * FROM orders WHERE owner=$1 AND idempotency_key=$2",
        [owner(req), key],
      )
    ).rows[0];
    if (existing) {
      if (existing.request_hash !== requestHash)
        fail(
          409,
          "IDEMPOTENCY_CONFLICT",
          "Этот ключ уже использован для другого заказа.",
        );
      return existing;
    }
    const cfg = await config(db);
    if (!cfg.orderingEnabled)
      fail(503, "ORDERING_DISABLED", "Приём заказов временно приостановлен.");
    const session = (
      await db.query("SELECT cart FROM sessions WHERE id=$1 FOR UPDATE", [
        req.session.id,
      ])
    ).rows[0];
    const promotion = await resolvePromotion(
      db,
      input.promo,
      true,
      req.session.user?.id,
    );
    const quote = priceCart(
      session.cart,
      await dishes(db),
      cfg,
      input,
      await balance(db, req.session.user?.id),
      true,
      promotion,
    );
    validateFulfillment(cfg, input);
    const id = randomUUID();
    const payment = await payOnReceipt.createPayment(quote.total);
    const data = {
      ...quote,
      fulfillment: input.fulfillment,
      contact: {
        name: input.name,
        phone: input.phone,
        address: input.fulfillment === "DELIVERY" ? input.address : cfg.address,
        zoneId: input.zoneId,
        time: input.time,
        notes: input.notes,
      },
      paymentProvider: payment.provider,
      currency: cfg.currency,
      demo: cfg.demo,
    };
    const saved = (
      await db.query(
        "INSERT INTO orders(id,owner,user_id,idempotency_key,request_hash,data) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
        [
          id,
          owner(req),
          req.session.user?.id ?? null,
          key,
          requestHash,
          JSON.stringify(data),
        ],
      )
    ).rows[0];
    if (promotion)
      await consumePromotion(db, promotion, req.session.user?.id, saved.id);
    if (input.points)
      await db.query(
        "INSERT INTO loyalty_transactions(id,user_id,points,type,reference_id,description) VALUES($1,$2,$3,'REDEEM',$4,'Списание на заказ')",
        [randomUUID(), req.session.user!.id, -input.points, id],
      );
    await db.query("UPDATE sessions SET cart='[]' WHERE id=$1", [
      req.session.id,
    ]);
    await notify(
      db,
      owner(req),
      req.session.user?.id ?? null,
      "Заказ получен",
      `Заказ №${saved.number}. Ожидайте подтверждения ресторана. Оплата при получении.`,
      id,
    );
    return saved;
  });
  res.status(201).json({ data: orderView(row), error: null });
});
ordersRouter.post("/:id/cancel", async (req, res) => {
  await transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [owner(req)]);
    const row = await ownedOrder(db, req, req.params.id, true);
    await checkBillUnlocked(db, row.visit_id);
    if (row.gift_paid)
      fail(
        409,
        "REFUND_REQUIRED",
        "Заказ частично оплачен сертификатом. Для отмены обратитесь в ресторан.",
      );
    if (row.status === "CANCELLED") return;
    if (
      !["CREATED", "CONFIRMED"].includes(row.status) ||
      row.payment_status === "PAID"
    )
      fail(
        409,
        "CANNOT_CANCEL",
        "Заказ уже готовится или оплачен. Свяжитесь с рестораном.",
      );
    await db.query("UPDATE orders SET status='CANCELLED' WHERE id=$1", [
      row.id,
    ]);
    await returnPoints(db, row);
    await notify(
      db,
      row.owner,
      row.user_id,
      "Заказ отменён",
      `Заказ №${row.number} отменён.`,
      row.id,
    );
  });
  res.json({ data: { ok: true }, error: null });
});
ordersRouter.post("/:id/reorder", async (req, res) => {
  const row = await ownedOrder(pool, req, req.params.id);
  const menu = await dishes(pool);
  const warnings: string[] = [];
  const items: CartItem[] = [];
  for (const item of row.data.items as CartItem[]) {
    const dish = menu.find((d) => d.id === item.dishId);
    if (!dish?.available) {
      warnings.push("Одно из блюд больше недоступно.");
      continue;
    }
    const copy = {
      id: randomUUID(),
      dishId: item.dishId,
      quantity: item.quantity,
      modifiers: item.modifiers,
      notes: item.notes,
    };
    try {
      priceCart(
        [copy],
        menu,
        await config(pool),
        { fulfillment: "PICKUP", zoneId: "", promo: "", points: 0 },
        0,
        false,
      );
      items.push(copy);
    } catch {
      warnings.push(
        `Проверьте добавки для «${dish.name}»: позиция не добавлена.`,
      );
    }
  }
  if (!items.length)
    fail(
      409,
      "REORDER_UNAVAILABLE",
      "Блюда прошлого заказа сейчас недоступны.",
    );
  await pool.query("UPDATE sessions SET cart=$1 WHERE id=$2", [
    JSON.stringify(items),
    req.session.id,
  ]);
  res.json({
    data: { items, warnings, fulfillment: row.data.fulfillment },
    error: null,
  });
});
export async function changeOrderStatus(
  db: DB,
  id: string,
  status: string,
  actor: string,
) {
  const row = (
    await db.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [id])
  ).rows[0];
  if (!row) fail(404, "NOT_FOUND", "Заказ не найден.");
  if (status === "CANCELLED") {
    await checkBillUnlocked(db, row.visit_id);
    if (row.gift_paid)
      fail(
        409,
        "REFUND_REQUIRED",
        "Заказ оплачен сертификатом. Отмена требует возврата через ресторан.",
      );
  }
  if (!nextStates(row.status, row.data.fulfillment).includes(status))
    fail(409, "INVALID_TRANSITION", "Недопустимый переход статуса.");
  if (status === "CANCELLED" && row.payment_status === "PAID")
    fail(409, "REFUND_REQUIRED", "Сначала оформите возврат через ресторан.");
  if (status === "COMPLETED" && row.payment_status !== "PAID")
    fail(
      409,
      "PAYMENT_REQUIRED",
      "Подтвердите получение оплаты перед завершением.",
    );
  if (status === "COMPLETED" && row.user_id)
    await db.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
      row.user_id,
    ]);
  await db.query("UPDATE orders SET status=$1 WHERE id=$2", [status, id]);
  if (status === "CANCELLED") await returnPoints(db, row);
  if (status === "COMPLETED" && row.user_id) {
    const cfg = await config(db);
    const points = Math.floor(
      (((row.data.subtotal - row.data.discount - row.data.loyaltyDiscount) /
        100) *
        cfg.loyaltyPercent) /
        100,
    );
    await db.query(
      "INSERT INTO loyalty_transactions(id,user_id,points,type,reference_id,description) VALUES($1,$2,$3,'EARN',$4,'Бонусы за завершённый заказ') ON CONFLICT DO NOTHING",
      [randomUUID(), row.user_id, points, id],
    );
    if (row.data.total > 0) await rewardReferral(db, row.user_id, id);
  }
  await audit(
    db,
    actor,
    "ORDER_STATUS",
    id,
    { status: row.status },
    { status },
  );
  await notify(
    db,
    row.owner,
    row.user_id,
    orderLabels[status],
    `Заказ №${row.number}: ${orderLabels[status].toLowerCase()}.`,
    id,
  );
}
