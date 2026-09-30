import { Router } from "express";
import { z } from "zod";
import { pool, transaction } from "../db";
import { audit, config, fail, localNow } from "../lib";
import { requireStaff } from "./auth";
import { orderView } from "./orders";
import { reservationView } from "./reservations";
import { visitView } from "./dine-in";

export const staffAdminRouter = Router();
staffAdminRouter.use(requireStaff);
staffAdminRouter.get("/operator", async (_req, res) => {
  const cfg = await config(pool),
    now = localNow(cfg);
  const [tables, visits, orders, reservations] = await Promise.all([
    pool.query(
      "SELECT id,name,seats,x,y,zone,shape,active FROM qr_tables WHERE active ORDER BY name",
    ),
    pool.query(
      "SELECT id FROM dine_visits WHERE status='OPEN' ORDER BY created_at",
    ),
    pool.query(
      "SELECT * FROM orders WHERE status NOT IN ('COMPLETED','CANCELLED') ORDER BY created_at",
    ),
    pool.query(
      "SELECT * FROM reservations WHERE date=$1 AND status IN ('PENDING','CONFIRMED','SEATED') ORDER BY start_minute",
      [now.date],
    ),
  ]);
  res.json({
    data: {
      tables: tables.rows,
      visits: await Promise.all(
        visits.rows.map((v) => visitView(pool, v.id, true)),
      ),
      orders: orders.rows.map(orderView),
      reservations: reservations.rows.map(reservationView),
      now: { ...now, timezone: cfg.timezone },
    },
    error: null,
  });
});
staffAdminRouter.use("/users", (req, _res, next) => {
  if (req.session.user?.role !== "ADMIN")
    fail(
      403,
      "ADMIN_REQUIRED",
      "Управлять правами может только администратор.",
    );
  next();
});
staffAdminRouter.get("/users", async (req, res) => {
  const { q, offset } = z
    .object({
      q: z.string().max(100).default(""),
      offset: z.coerce.number().int().min(0).max(100000).default(0),
    })
    .parse(req.query);
  const rows = (
    await pool.query(
      "SELECT id,name,email,phone,role FROM users WHERE name ILIKE $1 OR email ILIKE $1 ORDER BY created_at,id LIMIT 51 OFFSET $2",
      ["%" + q + "%", offset],
    )
  ).rows;
  res.json({
    data: { users: rows.slice(0, 50), hasMore: rows.length > 50 },
    error: null,
  });
});
const roleSchema = z.enum(["CUSTOMER", "STAFF", "MANAGER", "ADMIN"]);
staffAdminRouter.patch("/users/:id/role", async (req, res) => {
  const id = z.uuid().parse(req.params.id),
    input = z
      .object({ role: roleSchema, expectedRole: roleSchema })
      .parse(req.body);
  const result = await transaction(async (db) => {
    await db.query(
      "SELECT pg_advisory_xact_lock(hashtext('staff-role-management'))",
    );
    const actor = (
      await db.query("SELECT role FROM users WHERE id=$1 FOR UPDATE", [
        req.session.user!.id,
      ])
    ).rows[0];
    if (actor?.role !== "ADMIN")
      fail(
        403,
        "ADMIN_REQUIRED",
        "Права администратора изменились. Обновите страницу.",
      );
    const target = (
      await db.query(
        "SELECT id,name,email,phone,role FROM users WHERE id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (!target) fail(404, "USER_NOT_FOUND", "Пользователь не найден.");
    if (target.role !== input.expectedRole)
      fail(
        409,
        "ROLE_CHANGED",
        "Роль уже изменена. Обновите список пользователей.",
      );
    if (id === req.session.user!.id && input.role !== "ADMIN")
      fail(
        409,
        "OWN_ADMIN",
        "Нельзя снять права администратора у самого себя.",
      );
    if (target.role === input.role) return target;
    await db.query("UPDATE users SET role=$2 WHERE id=$1", [id, input.role]);
    await audit(
      db,
      req.session.user!.id,
      "USER_ROLE_CHANGED",
      id,
      { role: target.role },
      { role: input.role },
    );
    return { ...target, role: input.role };
  });
  res.json({ data: result, error: null });
});
