import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool, transaction } from "../db";
import { audit, fail } from "../lib";
import { requireManager, requireStaff, requireUser } from "./auth";

export const eventsRouter = Router();
const selectEvents = `SELECT e.*,COALESCE((SELECT sum(guests)::int FROM event_signups s WHERE s.event_id=e.id),0) AS reserved,COALESCE((SELECT guests FROM event_signups s WHERE s.event_id=e.id AND s.user_id=$1),0) AS "myGuests" FROM restaurant_events e`;
eventsRouter.get("/events", async (req, res) =>
  res.json({
    data: (
      await pool.query(
        selectEvents +
          " WHERE (e.active AND e.starts_at>now()) OR EXISTS(SELECT 1 FROM event_signups s WHERE s.event_id=e.id AND s.user_id=$1) ORDER BY e.starts_at",
        [req.session.user?.id ?? null],
      )
    ).rows,
    error: null,
  }),
);
eventsRouter.put("/events/:id/signup", requireUser, async (req, res) => {
  const id = z.uuid().parse(req.params.id),
    guests = z.number().int().min(1).max(10).parse(req.body.guests);
  await transaction(async (db) => {
    const e = (
      await db.query("SELECT * FROM restaurant_events WHERE id=$1 FOR UPDATE", [
        id,
      ])
    ).rows[0];
    if (!e?.active || new Date(e.starts_at) <= new Date())
      fail(409, "EVENT_CLOSED", "Запись на событие закрыта.");
    const used = Number(
      (
        await db.query(
          "SELECT COALESCE(sum(guests),0) AS n FROM event_signups WHERE event_id=$1 AND user_id<>$2",
          [id, req.session.user!.id],
        )
      ).rows[0].n,
    );
    if (used + guests > e.capacity)
      fail(409, "EVENT_FULL", "Недостаточно свободных мест.");
    await db.query(
      "INSERT INTO event_signups(event_id,user_id,guests) VALUES($1,$2,$3) ON CONFLICT(event_id,user_id) DO UPDATE SET guests=$3",
      [id, req.session.user!.id, guests],
    );
  });
  res.json({ data: { ok: true }, error: null });
});
eventsRouter.delete("/events/:id/signup", requireUser, async (req, res) => {
  await pool.query(
    "DELETE FROM event_signups WHERE event_id=$1 AND user_id=$2",
    [z.uuid().parse(req.params.id), req.session.user!.id],
  );
  res.json({ data: { ok: true }, error: null });
});
export const adminEventsRouter = Router();
adminEventsRouter.use(requireStaff);
adminEventsRouter.get("/events", async (req, res) =>
  res.json({
    data: (
      await pool.query(selectEvents + " ORDER BY e.starts_at DESC", [
        req.session.user!.id,
      ])
    ).rows,
    error: null,
  }),
);
adminEventsRouter.get("/events/:id/guests", async (req, res) =>
  res.json({
    data: (
      await pool.query(
        "SELECT u.name,u.phone,u.email,s.guests FROM event_signups s JOIN users u ON u.id=s.user_id WHERE s.event_id=$1 ORDER BY s.created_at",
        [z.uuid().parse(req.params.id)],
      )
    ).rows,
    error: null,
  }),
);
const eventSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000),
  starts_at: z.iso.datetime({ offset: true }),
  capacity: z.number().int().min(1).max(300),
  active: z.boolean(),
});
adminEventsRouter.put("/events/:id", requireManager, async (req, res) => {
  const id =
      req.params.id === "new" ? randomUUID() : z.uuid().parse(req.params.id),
    input = eventSchema.parse(req.body);
  await transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "event:" + id,
    ]);
    const before = (
      await db.query("SELECT * FROM restaurant_events WHERE id=$1 FOR UPDATE", [
        id,
      ])
    ).rows[0];
    const count = Number(
      (
        await db.query(
          "SELECT COALESCE(sum(guests),0) AS n FROM event_signups WHERE event_id=$1",
          [id],
        )
      ).rows[0].n,
    );
    if (input.capacity < count)
      fail(409, "CAPACITY", "Вместимость меньше числа записавшихся.");
    if (input.active && new Date(input.starts_at) <= new Date())
      fail(400, "EVENT_DATE", "Дата события должна быть в будущем.");
    await db.query(
      "INSERT INTO restaurant_events(id,title,description,starts_at,capacity,active) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET title=$2,description=$3,starts_at=$4,capacity=$5,active=$6",
      [
        id,
        input.title,
        input.description,
        input.starts_at,
        input.capacity,
        input.active,
      ],
    );
    await audit(db, req.session.user!.id, "EVENT_UPDATE", id, before, input);
  });
  res.json({ data: { id, ...input }, error: null });
});
