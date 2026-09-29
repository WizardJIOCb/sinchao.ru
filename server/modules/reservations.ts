import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool, transaction, type DB } from "../db";
import { config, fail, hash, localNow, notify } from "../lib";
import { reservationSchema } from "../validation";
import { owner } from "./auth";
import { idempotency } from "./orders";
import type { Config } from "../../shared/types";
export const reservationView = (r: any) => ({
  ...r.data,
  id: r.id,
  status: r.status,
  createdAt: r.created_at,
});
export function validateReservationDate(
  cfg: Config,
  date: string,
  partySize: number,
) {
  const now = localNow(cfg);
  const value = Date.parse(date + "T00:00:00Z");
  if (
    !Number.isFinite(value) ||
    new Date(value).toISOString().slice(0, 10) !== date ||
    date < now.date ||
    value > Date.parse(now.date + "T00:00:00Z") + cfg.bookingDays * 86400000
  )
    fail(
      400,
      "BOOKING_DATE",
      `Выберите дату в ближайшие ${cfg.bookingDays} дней.`,
    );
  if (
    !Number.isInteger(partySize) ||
    partySize < 1 ||
    partySize > cfg.maxGuests
  )
    fail(
      400,
      "PARTY_SIZE",
      `Можно забронировать от 1 до ${cfg.maxGuests} гостей.`,
    );
}
export async function availability(
  db: DB,
  cfg: Config,
  date: string,
  partySize: number,
) {
  validateReservationDate(cfg, date, partySize);
  const now = localNow(cfg);
  const rows = (
    await db.query(
      "SELECT start_minute,end_minute,party_size FROM reservations WHERE date=$1 AND status IN ('PENDING','CONFIRMED','SEATED')",
      [date],
    )
  ).rows;
  const slots: { time: string; available: boolean }[] = [];
  for (
    let minute = cfg.openHour * 60;
    minute + cfg.reservationMinutes <= cfg.closeHour * 60;
    minute += 30
  ) {
    if (date === now.date && minute < now.minutes + 30) continue;
    let peak = 0;
    for (let t = minute; t < minute + cfg.reservationMinutes; t++) {
      const used = rows
        .filter((r) => r.start_minute <= t && r.end_minute > t)
        .reduce((sum, r) => sum + r.party_size, 0);
      peak = Math.max(peak, used);
    }
    slots.push({
      time: `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`,
      available: peak + partySize <= cfg.capacity,
    });
  }
  return slots;
}
export const reservationsRouter = Router();
reservationsRouter.get("/availability", async (req, res) => {
  const input = z
    .object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      partySize: z.coerce.number().int().min(1).max(20),
    })
    .parse(req.query);
  res.json({
    data: await availability(
      pool,
      await config(pool),
      input.date,
      input.partySize,
    ),
    error: null,
  });
});
reservationsRouter.get("/", async (req, res) =>
  res.json({
    data: (
      await pool.query(
        "SELECT * FROM reservations WHERE owner=$1 OR user_id=$2 ORDER BY date DESC,start_minute DESC LIMIT 100",
        [owner(req), req.session.user?.id ?? null],
      )
    ).rows.map(reservationView),
    error: null,
  }),
);
reservationsRouter.post("/", async (req, res) => {
  const input = reservationSchema.parse(req.body),
    key = idempotency(req),
    requestHash = hash(JSON.stringify(input));
  const row = await transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "reservation-owner:" + owner(req),
    ]);
    const old = (
      await db.query(
        "SELECT * FROM reservations WHERE owner=$1 AND idempotency_key=$2",
        [owner(req), key],
      )
    ).rows[0];
    if (old) {
      if (old.request_hash !== requestHash)
        fail(409, "IDEMPOTENCY_CONFLICT", "Ключ уже использован.");
      return old;
    }
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "reservation-date:" + input.date,
    ]);
    const cfg = await config(db);
    if (!cfg.seating.includes(input.seating))
      fail(400, "SEATING", "Выберите предпочтение из списка.");
    if (
      !(await availability(db, cfg, input.date, input.partySize)).some(
        (s) => s.time === input.time && s.available,
      )
    )
      fail(
        409,
        "RESERVATION_UNAVAILABLE",
        "Это время уже занято. Выберите другой доступный слот.",
      );
    const id = randomUUID(),
      minute =
        Number(input.time.slice(0, 2)) * 60 + Number(input.time.slice(3));
    const saved = (
      await db.query(
        "INSERT INTO reservations(id,owner,user_id,idempotency_key,request_hash,date,start_minute,end_minute,party_size,data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
        [
          id,
          owner(req),
          req.session.user?.id ?? null,
          key,
          requestHash,
          input.date,
          minute,
          minute + cfg.reservationMinutes,
          input.partySize,
          JSON.stringify(input),
        ],
      )
    ).rows[0];
    await notify(
      db,
      owner(req),
      req.session.user?.id ?? null,
      "Бронирование подтверждено",
      `${input.date} в ${input.time}, гостей: ${input.partySize}. Пожелание по размещению не гарантирует конкретный стол.`,
      id,
    );
    return saved;
  });
  res.status(201).json({ data: reservationView(row), error: null });
});
reservationsRouter.post("/:id/cancel", async (req, res) => {
  z.uuid().parse(req.params.id);
  await transaction(async (db) => {
    const row = (
      await db.query(
        "SELECT * FROM reservations WHERE id=$1 AND (owner=$2 OR user_id=$3) FOR UPDATE",
        [req.params.id, owner(req), req.session.user?.id ?? null],
      )
    ).rows[0];
    if (!row) fail(404, "NOT_FOUND", "Бронирование не найдено.");
    if (row.status === "CANCELLED") return;
    if (!["PENDING", "CONFIRMED"].includes(row.status))
      fail(409, "CANNOT_CANCEL", "Для отмены свяжитесь с рестораном.");
    await db.query("UPDATE reservations SET status='CANCELLED' WHERE id=$1", [
      row.id,
    ]);
    await notify(
      db,
      row.owner,
      row.user_id,
      "Бронирование отменено",
      `${row.data.date}, ${row.data.time}`,
      row.id,
    );
  });
  res.json({ data: { ok: true }, error: null });
});
