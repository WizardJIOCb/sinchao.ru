import { Router } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { pool, transaction, type DB } from "../db";
import { audit, config, fail, localNow } from "../lib";
import { requireManager, requireStaff } from "./auth";
import { v2Settings } from "./v2-core";
import type { Config } from "../../shared/types";

export async function availableTables(
  db: DB,
  cfg: Config,
  date: string,
  minute: number,
  partySize: number,
) {
  const result = await db.query(
    `SELECT t.id,t.name,t.seats,t.x,t.y,t.zone,t.shape,t.active,
    (t.seats >= $4 AND NOT EXISTS(SELECT 1 FROM reservations r WHERE r.table_id=t.id AND r.date=$1 AND r.status IN ('PENDING','CONFIRMED','SEATED') AND r.start_minute<$3 AND r.end_minute>$2)
    AND NOT EXISTS(SELECT 1 FROM dine_visits v WHERE v.table_id=t.id AND v.status='OPEN' AND $1::date=$5::date)) AS available
    FROM qr_tables t WHERE t.active ORDER BY t.seats,t.name`,
    [
      date,
      minute,
      minute + cfg.reservationMinutes,
      partySize,
      localNow(cfg).date,
    ],
  );
  return result.rows;
}
export const tablesRouter = Router();
tablesRouter.get("/floor", async (req, res) => {
  const input = z
    .object({
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      time: z
        .string()
        .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
        .optional(),
      partySize: z.coerce.number().int().min(1).max(20).default(2),
    })
    .parse(req.query);
  const cfg = await config(pool),
    settings = await v2Settings(pool);
  const tables =
    input.date && input.time
      ? await availableTables(
          pool,
          cfg,
          input.date,
          Number(input.time.slice(0, 2)) * 60 + Number(input.time.slice(3)),
          input.partySize,
        )
      : (
          await pool.query(
            "SELECT id,name,seats,x,y,zone,shape,active FROM qr_tables WHERE active ORDER BY name",
          )
        ).rows;
  res.json({
    data: {
      tables: cfg.demo || settings.floorPlanVerified ? tables : [],
      verified: settings.floorPlanVerified,
    },
    error: null,
  });
});
export const adminTablesRouter = Router();
adminTablesRouter.use(requireStaff);
adminTablesRouter.get("/tables", async (_req, res) =>
  res.json({
    data: {
      tables: (await pool.query("SELECT * FROM qr_tables ORDER BY name")).rows,
      settings: await v2Settings(pool),
    },
    error: null,
  }),
);
const tableSchema = z.object({
  name: z.string().trim().min(1).max(50),
  seats: z.number().int().min(1).max(20),
  x: z.number().int().min(0).max(85),
  y: z.number().int().min(0).max(80),
  zone: z.string().trim().min(1).max(60),
  shape: z.enum(["round", "square", "long"]),
  active: z.boolean(),
});
adminTablesRouter.post("/tables", requireManager, async (req, res) => {
  const input = tableSchema.parse(req.body);
  const row = await transaction(async (db) => {
    const r = (
      await db.query(
        "INSERT INTO qr_tables(token,name,seats,x,y,zone,shape,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
        [
          randomBytes(24).toString("hex"),
          input.name,
          input.seats,
          input.x,
          input.y,
          input.zone,
          input.shape,
          input.active,
        ],
      )
    ).rows[0];
    await audit(db, req.session.user!.id, "TABLE_CREATE", r.id, null, input);
    return r;
  });
  res.status(201).json({ data: row, error: null });
});
adminTablesRouter.put("/tables/:id", requireManager, async (req, res) => {
  const id = z.uuid().parse(req.params.id),
    input = tableSchema.parse(req.body);
  await transaction(async (db) => {
    const before = (
      await db.query("SELECT * FROM qr_tables WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (!before) fail(404, "NOT_FOUND", "Стол не найден.");
    if (!input.active || input.seats < before.seats) {
      if (
        (
          await db.query(
            "SELECT id FROM dine_visits WHERE table_id=$1 AND status='OPEN' UNION ALL SELECT id FROM reservations WHERE table_id=$1 AND status IN ('PENDING','CONFIRMED','SEATED') AND date >= $2::date",
            [id, localNow(await config(db)).date],
          )
        ).rowCount
      )
        fail(
          409,
          "TABLE_BUSY",
          "У стола есть посещение или будущая бронь. Сначала завершите или отмените их.",
        );
    }
    await db.query(
      "UPDATE qr_tables SET name=$2,seats=$3,x=$4,y=$5,zone=$6,shape=$7,active=$8 WHERE id=$1",
      [
        id,
        input.name,
        input.seats,
        input.x,
        input.y,
        input.zone,
        input.shape,
        input.active,
      ],
    );
    await audit(db, req.session.user!.id, "TABLE_UPDATE", id, before, input);
  });
  res.json({ data: { ok: true }, error: null });
});
adminTablesRouter.put("/settings", requireManager, async (req, res) => {
  const input = z
    .object({
      floorPlanVerified: z.boolean(),
      referralPoints: z.number().int().min(0).max(1000),
      referralsEnabled: z.boolean(),
      giftValidityDays: z.number().int().min(1).max(1095),
    })
    .parse(req.body);
  await transaction(async (db) => {
    await db.query("SELECT id FROM v2_settings WHERE id=1 FOR UPDATE");
    const before = await v2Settings(db);
    await db.query("UPDATE v2_settings SET data=$1 WHERE id=1", [
      JSON.stringify(input),
    ]);
    await audit(db, req.session.user!.id, "V2_SETTINGS", "1", before, input);
  });
  res.json({ data: input, error: null });
});
