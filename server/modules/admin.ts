import { Router } from "express";
import { z } from "zod";
import { pool, transaction } from "../db";
import { audit, config, fail, notify } from "../lib";
import { requireStaff, requireManager } from "./auth";
import { changeOrderStatus, orderView } from "./orders";
import { reservationView } from "./reservations";
import { dishSchema } from "../validation";
import { payOnReceipt } from "./payments";
const settings = z
  .object({
    name: z.string().min(2).max(80),
    tagline: z.string().max(200),
    address: z.string().min(5).max(300),
    phone: z.string().max(30),
    timezone: z.string().refine((v) => {
      try {
        new Intl.DateTimeFormat("ru", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }),
    currency: z.literal("RUB"),
    demo: z.boolean(),
    orderingEnabled: z.boolean(),
    openHour: z.number().int().min(0).max(23),
    closeHour: z.number().int().min(1).max(24),
    leadMinutes: z.number().int().min(10).max(180),
    deliveryEta: z.string().max(40),
    pickupEta: z.string().max(40),
    zones: z
      .array(
        z.object({
          id: z.string().min(1).max(80),
          name: z.string().min(1).max(80),
          fee: z.number().int().min(0).max(100000),
          minimum: z.number().int().min(0).max(1000000),
          streets: z.array(z.string().min(3).max(100)).min(1).max(200),
        }),
      )
      .max(20),
    seating: z.array(z.string().min(1).max(60)).min(1).max(10),
    capacity: z.number().int().min(1).max(300),
    reservationMinutes: z.number().int().min(30).max(240),
    bookingDays: z.number().int().min(1).max(90),
    maxGuests: z.number().int().min(1).max(20),
    loyaltyPercent: z.number().int().min(0).max(30),
    redemptionPercent: z.number().int().min(0).max(100),
    promo: z.object({
      code: z.string().max(30),
      percent: z.number().int().min(0).max(80),
      enabled: z.boolean(),
    }),
    heroImage: z
      .string()
      .max(1000)
      .refine((v) => v.startsWith("/images/") || v.startsWith("https://")),
  })
  .refine(
    (c) =>
      c.closeHour > c.openHour &&
      c.maxGuests <= c.capacity &&
      c.reservationMinutes <= (c.closeHour - c.openHour) * 60,
  );
export const adminRouter = Router();
adminRouter.use(requireStaff);
adminRouter.get("/dashboard", async (_req, res) => {
  const [orders, reservations, logs, tables] = await Promise.all([
    pool.query("SELECT * FROM orders ORDER BY created_at DESC LIMIT 150"),
    pool.query(
      "SELECT * FROM reservations ORDER BY date DESC,start_minute DESC LIMIT 150",
    ),
    pool.query(
      "SELECT id,action,entity_id,created_at FROM audit_logs ORDER BY created_at DESC LIMIT 30",
    ),
    pool.query("SELECT token,name,active FROM qr_tables"),
  ]);
  res.json({
    data: {
      orders: orders.rows.map(orderView),
      reservations: reservations.rows.map(reservationView),
      audit: logs.rows,
      tables: tables.rows,
    },
    error: null,
  });
});
adminRouter.patch("/orders/:id/status", async (req, res) => {
  const id = z.uuid().parse(req.params.id),
    status = z.string().parse(req.body.status);
  await transaction((db) =>
    changeOrderStatus(db, id, status, req.session.user!.id),
  );
  res.json({ data: { ok: true }, error: null });
});
adminRouter.post("/orders/:id/payment", async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  await transaction(async (db) => {
    const r = (
      await db.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (!r) fail(404, "NOT_FOUND", "Заказ не найден.");
    if (r.status === "CANCELLED") fail(409, "CANCELLED", "Заказ отменён.");
    if (r.payment_status === "PAID") return;
    await payOnReceipt.confirmPayment(r.data.total);
    await db.query("UPDATE orders SET payment_status='PAID' WHERE id=$1", [id]);
    await audit(
      db,
      req.session.user!.id,
      "PAYMENT_CONFIRMED",
      id,
      { status: r.payment_status },
      { status: "PAID", amount: r.data.total },
    );
    await notify(
      db,
      r.owner,
      r.user_id,
      "Оплата получена",
      `Оплата заказа №${r.number} подтверждена рестораном.`,
      id,
    );
  });
  res.json({ data: { ok: true }, error: null });
});
adminRouter.patch("/reservations/:id", async (req, res) => {
  const id = z.uuid().parse(req.params.id),
    status = z
      .enum(["SEATED", "COMPLETED", "CANCELLED", "NO_SHOW"])
      .parse(req.body.status);
  await transaction(async (db) => {
    const r = (
      await db.query("SELECT * FROM reservations WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (!r) fail(404, "NOT_FOUND", "Бронь не найдена.");
    const states: Record<string, string[]> = {
      CONFIRMED: ["SEATED", "CANCELLED", "NO_SHOW"],
      SEATED: ["COMPLETED"],
    };
    if (!states[r.status]?.includes(status))
      fail(409, "INVALID_TRANSITION", "Недопустимый переход статуса.");
    await db.query("UPDATE reservations SET status=$1 WHERE id=$2", [
      status,
      id,
    ]);
    await audit(
      db,
      req.session.user!.id,
      "RESERVATION_STATUS",
      id,
      { status: r.status },
      { status },
    );
  });
  res.json({ data: { ok: true }, error: null });
});
adminRouter.put("/dishes/:id", requireManager, async (req, res) => {
  const d = dishSchema.parse(req.body);
  if (d.id !== req.params.id)
    fail(400, "ID_MISMATCH", "ID блюда не совпадает.");
  await transaction(async (db) => {
    if (
      !(await db.query("SELECT id FROM categories WHERE id=$1", [d.categoryId]))
        .rowCount
    )
      fail(400, "CATEGORY", "Категория не найдена.");
    const before =
      (await db.query("SELECT data FROM dishes WHERE id=$1 FOR UPDATE", [d.id]))
        .rows[0]?.data ?? null;
    await db.query(
      "INSERT INTO dishes(id,data,position) VALUES($1,$2,100) ON CONFLICT(id) DO UPDATE SET data=$2",
      [d.id, JSON.stringify(d)],
    );
    await audit(db, req.session.user!.id, "DISH_UPDATE", d.id, before, d);
  });
  res.json({ data: d, error: null });
});
adminRouter.put("/settings", requireManager, async (req, res) => {
  const value = settings.parse(req.body);
  await transaction(async (db) => {
    await db.query("SELECT id FROM restaurant WHERE id=1 FOR UPDATE");
    const before = await config(db);
    await db.query("UPDATE restaurant SET data=$1 WHERE id=1", [
      JSON.stringify(value),
    ]);
    await audit(
      db,
      req.session.user!.id,
      "SETTINGS_UPDATE",
      "1",
      before,
      value,
    );
  });
  res.json({ data: value, error: null });
});
adminRouter.put("/categories", requireManager, async (req, res) => {
  const rows = z
    .array(
      z.object({
        id: z
          .string()
          .regex(/^[a-z0-9-]+$/)
          .max(80),
        name: z.string().min(1).max(80),
        subtitle: z.string().max(100),
      }),
    )
    .min(1)
    .max(30)
    .parse(req.body);
  if (new Set(rows.map((r) => r.id)).size !== rows.length)
    fail(400, "DUPLICATE_CATEGORY", "ID категорий должны быть уникальными.");
  await transaction(async (db) => {
    const ids = rows.map((r) => r.id);
    const used = await db.query(
      "SELECT id FROM dishes WHERE NOT (data->>'categoryId'=ANY($1::text[]))",
      [ids],
    );
    if (used.rowCount)
      fail(
        409,
        "CATEGORY_IN_USE",
        "Сначала перенесите блюда из удаляемой категории.",
      );
    const before = (await db.query("SELECT data FROM categories")).rows;
    await db.query("DELETE FROM categories");
    for (let i = 0; i < rows.length; i++)
      await db.query(
        "INSERT INTO categories(id,data,position) VALUES($1,$2,$3)",
        [rows[i].id, JSON.stringify(rows[i]), i],
      );
    await audit(
      db,
      req.session.user!.id,
      "CATEGORIES_UPDATE",
      "all",
      before,
      rows,
    );
  });
  res.json({ data: rows, error: null });
});
