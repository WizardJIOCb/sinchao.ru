import { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool, transaction } from "../db";
import { balance, config, dishes, fail } from "../lib";
import { cartItemSchema, quoteSchema } from "../validation";
import { priceCart, fulfillmentTimes } from "./pricing";
import type { CartItem } from "../../shared/types";
import { resolvePromotion } from "./marketing";
export const cartRouter = Router();
cartRouter.get("/", async (req, res) =>
  res.json({ data: req.session.cart, error: null }),
);
cartRouter.get("/times", async (_req, res) =>
  res.json({ data: fulfillmentTimes(await config(pool)), error: null }),
);
cartRouter.post("/quote", async (req, res) => {
  const input = quoteSchema.parse(req.body);
  res.json({
    data: priceCart(
      req.session.cart,
      await dishes(pool),
      await config(pool),
      input,
      await balance(pool, req.session.user?.id),
      true,
      await resolvePromotion(pool, input.promo, false, req.session.user?.id),
    ),
    error: null,
  });
});
cartRouter.post("/items", async (req, res) => {
  const item = { ...cartItemSchema.parse(req.body), id: randomUUID() };
  const cart = await transaction(async (db) => {
    const row = (
      await db.query("SELECT cart FROM sessions WHERE id=$1 FOR UPDATE", [
        req.session.id,
      ])
    ).rows[0];
    if (!row) fail(401, "SESSION_EXPIRED", "Обновите страницу.");
    if (row.cart.length >= 50)
      fail(400, "CART_LIMIT", "Не более 50 позиций в корзине.");
    const next = [...row.cart, item];
    priceCart(
      next,
      await dishes(db),
      await config(db),
      { fulfillment: "PICKUP", zoneId: "", promo: "", points: 0 },
      0,
      false,
    );
    await db.query("UPDATE sessions SET cart=$1 WHERE id=$2", [
      JSON.stringify(next),
      req.session.id,
    ]);
    return next;
  });
  res.json({ data: cart, error: null });
});
cartRouter.patch("/items/:id", async (req, res) => {
  const input = cartItemSchema.parse(req.body);
  const cart = await transaction(async (db) => {
    const old = (
      await db.query("SELECT cart FROM sessions WHERE id=$1 FOR UPDATE", [
        req.session.id,
      ])
    ).rows[0].cart as CartItem[];
    if (!old.some((i) => i.id === req.params.id))
      fail(404, "NOT_FOUND", "Позиция не найдена.");
    const next = old.map((i) =>
      i.id === req.params.id ? { ...input, id: i.id } : i,
    );
    priceCart(
      next,
      await dishes(db),
      await config(db),
      { fulfillment: "PICKUP", zoneId: "", promo: "", points: 0 },
      0,
      false,
    );
    await db.query("UPDATE sessions SET cart=$1 WHERE id=$2", [
      JSON.stringify(next),
      req.session.id,
    ]);
    return next;
  });
  res.json({ data: cart, error: null });
});
cartRouter.delete("/items/:id", async (req, res) => {
  await transaction(async (db) => {
    const old = (
      await db.query("SELECT cart FROM sessions WHERE id=$1 FOR UPDATE", [
        req.session.id,
      ])
    ).rows[0].cart as CartItem[];
    await db.query("UPDATE sessions SET cart=$1 WHERE id=$2", [
      JSON.stringify(old.filter((i) => i.id !== req.params.id)),
      req.session.id,
    ]);
  });
  res.json({ data: { ok: true }, error: null });
});
cartRouter.delete("/", async (req, res) => {
  await pool.query("UPDATE sessions SET cart='[]' WHERE id=$1", [
    req.session.id,
  ]);
  res.json({ data: { ok: true }, error: null });
});
