import { Router } from "express";
import { assertNoActiveTablePayment } from "../online-payments";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool, transaction } from "../db";
import { audit, fail } from "../lib";
import { requireStaff, requireUser } from "./auth";
import { idempotency } from "./orders";
import { newCode, v2Settings } from "./v2-core";
export const giftsRouter = Router();
giftsRouter.use("/gifts", requireUser);
giftsRouter.get("/gifts", async (req, res) =>
  res.json({
    data: (
      await pool.query(
        "SELECT id,CASE WHEN status='ACTIVE' THEN code ELSE NULL END AS code,amount,balance,status,message,expires_at FROM gift_certificates WHERE buyer_id=$1 ORDER BY created_at DESC LIMIT 100",
        [req.session.user!.id],
      )
    ).rows,
    error: null,
  }),
);
giftsRouter.post("/gifts", async (req, res) => {
  const input = z
      .object({
        amount: z.number().int().min(10000).max(10000000),
        message: z.string().trim().max(300).default(""),
      })
      .parse(req.body),
    key = idempotency(req);
  const id = await transaction(async (db) => {
    await db.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
      req.session.user!.id,
    ]);
    const old = (
      await db.query(
        "SELECT * FROM gift_certificates WHERE buyer_id=$1 AND idempotency_key=$2",
        [req.session.user!.id, key],
      )
    ).rows[0];
    if (old) {
      if (old.amount !== input.amount || old.message !== input.message)
        fail(409, "IDEMPOTENCY_CONFLICT", "Ключ уже использован.");
      return old.id;
    }
    const id = randomUUID();
    await db.query(
      "INSERT INTO gift_certificates(id,buyer_id,code,amount,message,idempotency_key) VALUES($1,$2,$3,$4,$5,$6)",
      [id, req.session.user!.id, newCode(), input.amount, input.message, key],
    );
    return id;
  });
  res.status(201).json({ data: { id }, error: null });
});
export const adminGiftsRouter = Router();
adminGiftsRouter.use(requireStaff);
adminGiftsRouter.get("/gifts", async (_req, res) =>
  res.json({
    data: (
      await pool.query(
        "SELECT g.*,u.name AS buyer_name FROM gift_certificates g JOIN users u ON u.id=g.buyer_id ORDER BY g.created_at DESC LIMIT 100",
      )
    ).rows,
    error: null,
  }),
);
adminGiftsRouter.post("/gifts/:id/activate", async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  await transaction(async (db) => {
    const gift = (
      await db.query("SELECT * FROM gift_certificates WHERE id=$1 FOR UPDATE", [
        id,
      ])
    ).rows[0];
    if (!gift) fail(404, "NOT_FOUND", "Сертификат не найден.");
    if (gift.status === "ACTIVE") return;
    if (gift.status !== "PENDING")
      fail(409, "GIFT_STATE", "Сертификат отменён.");
    const cfg = await v2Settings(db);
    await db.query(
      "UPDATE gift_certificates SET status='ACTIVE',balance=amount,expires_at=now()+($2::int*interval '1 day') WHERE id=$1",
      [id, cfg.giftValidityDays],
    );
    await audit(db, req.session.user!.id, "GIFT_PAYMENT_CONFIRMED", id, null, {
      amount: gift.amount,
      validDays: cfg.giftValidityDays,
    });
  });
  res.json({ data: { ok: true }, error: null });
});
adminGiftsRouter.post("/gifts/:id/cancel", async (req, res) => {
  await transaction(async (db) => {
    const id = z.uuid().parse(req.params.id);
    const r = await db.query(
      "UPDATE gift_certificates SET status='CANCELLED' WHERE id=$1 AND status='PENDING' RETURNING id",
      [id],
    );
    if (!r.rowCount)
      fail(409, "GIFT_STATE", "Отменить можно только неоплаченный сертификат.");
    await audit(db, req.session.user!.id, "GIFT_CANCEL", id, null, {
      cancelled: true,
    });
  });
  res.json({ data: { ok: true }, error: null });
});
adminGiftsRouter.post("/gifts/redeem", async (req, res) => {
  const input = z
      .object({
        code: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-F0-9]{24}$/),
        orderId: z.uuid().optional(),
        shareId: z.uuid().optional(),
        amount: z.number().int().min(1).max(10000000),
      })
      .refine(
        (v) => !!v.orderId !== !!v.shareId,
        "Выберите заказ или часть счёта",
      )
      .parse(req.body),
    key = idempotency(req);
  const result = await transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "gift-redeem:" + key,
    ]);
    const old = (
      await db.query(
        "SELECT r.*,g.code FROM gift_redemptions r JOIN gift_certificates g ON g.id=r.certificate_id WHERE r.idempotency_key=$1",
        [key],
      )
    ).rows[0];
    if (old) {
      if (
        old.order_id !== (input.orderId ?? null) ||
        old.share_id !== (input.shareId ?? null) ||
        old.amount !== input.amount ||
        old.code !== input.code
      )
        fail(409, "IDEMPOTENCY_CONFLICT", "Ключ уже использован.");
      return { redeemed: old.amount };
    }
    let visitId: string | undefined;
    if (input.shareId) {
      visitId = (
        await db.query("SELECT visit_id FROM bill_shares WHERE id=$1", [
          input.shareId,
        ])
      ).rows[0]?.visit_id;
      if (
        !visitId ||
        !(
          await db.query(
            "SELECT id FROM dine_visits WHERE id=$1 AND status='OPEN' FOR UPDATE",
            [visitId],
          )
        ).rowCount
      )
        fail(409, "VISIT_CLOSED", "Счёт не найден или посещение закрыто.");
    }
    const gift = (
      await db.query(
        "SELECT * FROM gift_certificates WHERE code=$1 FOR UPDATE",
        [input.code],
      )
    ).rows[0];
    if (
      !gift ||
      gift.status !== "ACTIVE" ||
      new Date(gift.expires_at) <= new Date()
    )
      fail(
        409,
        "GIFT_UNAVAILABLE",
        "Сертификат не найден, не оплачен или истёк.",
      );
    if (gift.balance < input.amount)
      fail(409, "GIFT_BALANCE", "Недостаточно средств на сертификате.");
    if (input.orderId) {
      const order = (
        await db.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [
          input.orderId,
        ])
      ).rows[0];
      if (
        !order ||
        order.visit_id ||
        ["CANCELLED", "COMPLETED"].includes(order.status) ||
        order.payment_status === "PAID"
      )
        fail(
          409,
          "ORDER_STATE",
          "Выберите неоплаченный заказ доставки/самовывоза или часть счёта за столом.",
        );
      if (
        input.amount >
        order.data.total - (order.data.tip ?? 0) - order.gift_paid
      )
        fail(
          400,
          "GIFT_AMOUNT",
          "Сумма превышает остаток без чаевых. Чаевые оплачиваются отдельно от сертификата.",
        );
      await db.query(
        "UPDATE orders SET gift_paid=gift_paid+$2,payment_status=CASE WHEN gift_paid+$2=(data->>'total')::int THEN 'PAID' ELSE payment_status END WHERE id=$1",
        [input.orderId, input.amount],
      );
    } else {
      const share = (
        await db.query("SELECT * FROM bill_shares WHERE id=$1 FOR UPDATE", [
          input.shareId,
        ])
      ).rows[0];
      if (!share || share.paid)
        fail(409, "SHARE_PAID", "Эта часть счёта уже оплачена.");
      await assertNoActiveTablePayment(db, visitId!, share.id);
      if (input.amount > share.amount - share.tip - share.gift_paid)
        fail(
          400,
          "GIFT_AMOUNT",
          "Сумма превышает остаток без чаевых. Чаевые оплачиваются отдельно от сертификата.",
        );
      await db.query(
        "UPDATE bill_shares SET gift_paid=gift_paid+$2,paid=(gift_paid+$2=amount),paid_at=CASE WHEN gift_paid+$2=amount THEN now() ELSE NULL END WHERE id=$1",
        [input.shareId, input.amount],
      );
      if (
        !(
          await db.query(
            "SELECT id FROM bill_shares WHERE visit_id=$1 AND NOT paid",
            [visitId],
          )
        ).rowCount
      )
        await db.query(
          "UPDATE orders SET payment_status='PAID' WHERE visit_id=$1 AND status<>'CANCELLED'",
          [visitId],
        );
    }
    await db.query(
      "UPDATE gift_certificates SET balance=balance-$2 WHERE id=$1",
      [gift.id, input.amount],
    );
    await db.query(
      "INSERT INTO gift_redemptions(id,certificate_id,order_id,share_id,amount,actor_id,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        randomUUID(),
        gift.id,
        input.orderId ?? null,
        input.shareId ?? null,
        input.amount,
        req.session.user!.id,
        key,
      ],
    );
    await audit(db, req.session.user!.id, "GIFT_REDEEM", gift.id, null, {
      orderId: input.orderId,
      shareId: input.shareId,
      amount: input.amount,
    });
    return { redeemed: input.amount, balance: gift.balance - input.amount };
  });
  res.json({ data: result, error: null });
});
