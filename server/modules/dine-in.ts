import { Router, type Request } from "express";
import { randomInt, randomUUID } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { pool, transaction, type DB } from "../db";
import { audit, config, dishes, fail, hash, localNow, notify } from "../lib";
import { owner, requireStaff } from "./auth";
import { idempotency, orderView } from "./orders";
import { priceCart } from "./pricing";
import { resolvePromotion } from "./marketing";
import { consumePromotion } from "../registration-promotions";
import {
  minuteTime,
  reservationWhen,
  restaurantClock,
} from "../../shared/reservation-time";
import { checkBillUnlocked, equalShares, v2Settings } from "./v2-core";
import { tipSchema } from "../validation";
import { calculateTip, splitTip } from "../../shared/tips";

export async function visitView(db: DB, id: string, staff = false) {
  const v = (
    await db.query(
      "SELECT v.*,t.name FROM dine_visits v JOIN qr_tables t ON t.id=v.table_id WHERE v.id=$1",
      [id],
    )
  ).rows[0];
  if (!v) fail(404, "NOT_FOUND", "Посещение не найдено.");
  const booking = v.reservation_id
    ? (
        await db.query(
          "SELECT data,start_minute,end_minute FROM reservations WHERE id=$1",
          [v.reservation_id],
        )
      ).rows[0]
    : null;
  const rows = (
    await db.query(
      "SELECT * FROM orders WHERE visit_id=$1 ORDER BY created_at",
      [id],
    )
  ).rows;
  const shares = (
    await db.query(
      'SELECT id,position,amount,tip,paid,gift_paid AS "giftPaid" FROM bill_shares WHERE visit_id=$1 ORDER BY position',
      [id],
    )
  ).rows;
  const foodTotal = rows
    .filter((r) => r.status !== "CANCELLED")
    .reduce((s, r) => s + r.data.total, 0);
  const tip = calculateTip(foodTotal, v.tip_choice);
  return {
    foodTotal,
    tip,
    tipChoice: v.tip_choice,
    tipVersion: v.tip_version,
    id: v.id,
    reservation: booking
      ? {
          date: booking.data.date,
          time: minuteTime(booking.start_minute),
          endTime: minuteTime(booking.end_minute),
          timezone: booking.data.timezone,
        }
      : null,
    tableId: v.table_id,
    tableName: v.name,
    status: v.status,
    ...(staff ? { joinCode: v.join_code } : {}),
    orders: rows.map((r) => {
      const o = orderView(r);
      return staff
        ? o
        : {
            ...o,
            contact: {
              ...o.contact,
              name: "Гость за столом",
              phone: "",
              notes: "",
            },
          };
    }),
    total: foodTotal + tip,
    paid: shares.reduce((s, r) => s + (r.paid ? r.amount : r.giftPaid), 0),
    shares,
    calls: (
      await db.query(
        "SELECT id,kind,status FROM waiter_calls WHERE visit_id=$1 ORDER BY created_at DESC",
        [id],
      )
    ).rows,
  };
}
async function member(db: DB, req: Request, id: string, lock = false) {
  z.uuid().parse(id);
  const v = (
    await db.query(
      `SELECT v.* FROM dine_visits v WHERE v.id=$1 AND EXISTS(SELECT 1 FROM dine_members m WHERE m.visit_id=v.id AND (m.owner=$2 OR m.user_id=$3)) ${lock ? "FOR UPDATE" : ""}`,
      [id, owner(req), req.session.user?.id ?? null],
    )
  ).rows[0];
  if (!v)
    fail(
      404,
      "VISIT_NOT_FOUND",
      "Посещение не найдено. Отсканируйте QR-код и введите код визита.",
    );
  if (v.status !== "OPEN")
    fail(
      409,
      "VISIT_CLOSED",
      "Посещение уже завершено. Обратитесь к официанту.",
    );
  return v;
}
export const dineRouter = Router();
dineRouter.get("/visit", async (req, res) => {
  const v = (
    await pool.query(
      "SELECT v.id FROM dine_visits v WHERE v.status='OPEN' AND EXISTS(SELECT 1 FROM dine_members m WHERE m.visit_id=v.id AND (m.owner=$1 OR m.user_id=$2)) ORDER BY v.created_at DESC LIMIT 1",
      [owner(req), req.session.user?.id ?? null],
    )
  ).rows[0];
  res.json({ data: v ? await visitView(pool, v.id) : null, error: null });
});
dineRouter.post(
  "/visits/join",
  rateLimit({ windowMs: 60000, limit: 20 }),
  async (req, res) => {
    const input = z
      .object({ token: z.string().max(100), code: z.string().regex(/^\d{6}$/) })
      .parse(req.body);
    const id = await transaction(async (db) => {
      const v = (
        await db.query(
          "SELECT v.* FROM dine_visits v JOIN qr_tables t ON t.id=v.table_id WHERE t.token=$1 AND t.active AND v.status='OPEN' FOR UPDATE OF v",
          [input.token],
        )
      ).rows[0];
      if (!v || v.join_code !== input.code)
        fail(403, "VISIT_CODE", "Проверьте код визита у официанта.");
      await db.query(
        "INSERT INTO dine_members(visit_id,owner,user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [v.id, owner(req), req.session.user?.id ?? null],
      );
      return v.id;
    });
    res.json({ data: await visitView(pool, id), error: null });
  },
);
dineRouter.get("/visits/:id", async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  await member(pool, req, id);
  res.json({ data: await visitView(pool, id), error: null });
});
dineRouter.post("/visits/:id/orders", async (req, res) => {
  const promo = z
    .string()
    .trim()
    .toUpperCase()
    .max(30)
    .default("")
    .parse(req.body.promo);
  const key = idempotency(req),
    id = z.uuid().parse(req.params.id);
  const row = await transaction(async (db) => {
    await member(db, req, id, true);
    const old = (
      await db.query(
        "SELECT * FROM orders WHERE owner=$1 AND idempotency_key=$2",
        [owner(req), key],
      )
    ).rows[0];
    if (old) {
      if (old.visit_id !== id || (old.data.promoCode ?? "") !== promo)
        fail(409, "IDEMPOTENCY_CONFLICT", "Ключ уже использован.");
      return old;
    }
    await checkBillUnlocked(db, id);
    const cfg = await config(db);
    if (!cfg.orderingEnabled)
      fail(503, "ORDERING_DISABLED", "Приём заказов приостановлен.");
    const s = (
      await db.query("SELECT cart FROM sessions WHERE id=$1 FOR UPDATE", [
        req.session.id,
      ])
    ).rows[0];
    const promotion = await resolvePromotion(
      db,
      promo,
      true,
      req.session.user?.id,
    );
    const quote = priceCart(
      s.cart,
      await dishes(db),
      cfg,
      { fulfillment: "DINE_IN", zoneId: "", promo, points: 0 },
      0,
      true,
      promotion,
    );
    const table = (
      await db.query(
        "SELECT t.name FROM qr_tables t JOIN dine_visits v ON v.table_id=t.id WHERE v.id=$1",
        [id],
      )
    ).rows[0];
    const data = {
      ...quote,
      fulfillment: "DINE_IN",
      tableName: table.name,
      contact: {
        name: req.session.user?.name ?? "Гость",
        phone: "",
        address: table.name,
        zoneId: "",
        time: "За столом",
        notes: "",
      },
      demo: cfg.demo,
    };
    const saved = (
      await db.query(
        "INSERT INTO orders(id,owner,user_id,idempotency_key,request_hash,data,visit_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
        [
          randomUUID(),
          owner(req),
          req.session.user?.id ?? null,
          key,
          hash(id),
          JSON.stringify(data),
          id,
        ],
      )
    ).rows[0];
    if (promotion)
      await consumePromotion(db, promotion, req.session.user?.id, saved.id);
    await db.query("UPDATE sessions SET cart='[]' WHERE id=$1", [
      req.session.id,
    ]);
    await notify(
      db,
      owner(req),
      req.session.user?.id ?? null,
      "Заказ за столом",
      `Заказ №${saved.number} передан ресторану.`,
      saved.id,
    );
    return saved;
  });
  res.status(201).json({ data: orderView(row), error: null });
});
dineRouter.post(
  "/visits/:id/call",
  rateLimit({ windowMs: 60000, limit: 20 }),
  async (req, res) => {
    const kind = z.enum(["WAITER", "BILL"]).parse(req.body.kind);
    await transaction(async (db) => {
      await member(db, req, z.uuid().parse(req.params.id), true);
      await db.query(
        "INSERT INTO waiter_calls(id,visit_id,kind) VALUES($1,$2,$3) ON CONFLICT (visit_id,kind) WHERE status='OPEN' DO NOTHING",
        [randomUUID(), req.params.id, kind],
      );
    });
    res.json({ data: { ok: true }, error: null });
  },
);
dineRouter.post("/visits/:id/split", async (req, res) => {
  const count = z.number().int().min(1).max(20).parse(req.body.count);
  await transaction(async (db) => {
    await member(db, req, z.uuid().parse(req.params.id), true);
    await createShares(db, z.uuid().parse(req.params.id), count);
  });
  res.json({ data: await visitView(pool, req.params.id), error: null });
});

dineRouter.put("/visits/:id/tip", async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const input = z
    .object({
      choice: tipSchema,
      expectedVersion: z.number().int().nonnegative(),
    })
    .parse(req.body);
  await transaction(async (db) => {
    const v = await member(db, req, id, true);
    await checkBillUnlocked(db, id);
    if (v.tip_version !== input.expectedVersion)
      fail(
        409,
        "TIP_CHANGED",
        "Чаевые уже изменены другим гостем. Обновите счёт.",
      );
    if (
      (
        await db.query(
          "SELECT id FROM orders WHERE visit_id=$1 AND status<>'CANCELLED' AND payment_status='PAID' LIMIT 1",
          [id],
        )
      ).rowCount
    )
      fail(409, "BILL_PAID", "Заказы уже оплачены. Обратитесь к официанту.");
    await db.query(
      "UPDATE dine_visits SET tip_choice=$2,tip_version=tip_version+1,tip_user_id=$3 WHERE id=$1",
      [id, JSON.stringify(input.choice), req.session.user?.id ?? null],
    );
    await audit(
      db,
      req.session.user?.id ?? null,
      "VISIT_TIP_CHANGED",
      id,
      v.tip_choice,
      input.choice,
    );
  });
  res.json({ data: await visitView(pool, id), error: null });
});

async function createShares(db: DB, id: string, count: number) {
  const existing = (
    await db.query("SELECT id FROM bill_shares WHERE visit_id=$1", [id])
  ).rows;
  if (existing.length) {
    if (existing.length === count) return;
    fail(
      409,
      "ALREADY_SPLIT",
      "Счёт уже разделён. Для изменения обратитесь к официанту.",
    );
  }
  const orders = (
    await db.query(
      "SELECT * FROM orders WHERE visit_id=$1 AND status<>'CANCELLED' FOR UPDATE",
      [id],
    )
  ).rows;
  if (!orders.length || orders.some((o) => o.payment_status === "PAID"))
    fail(409, "BILL_STATE", "Счёт пуст или уже оплачен.");
  const foodTotal = orders.reduce((s, r) => s + r.data.total, 0);
  const v = (
    await db.query("SELECT tip_choice FROM dine_visits WHERE id=$1", [id])
  ).rows[0];
  const tip = calculateTip(foodTotal, v.tip_choice);
  const total = foodTotal + tip;
  const tips = splitTip(tip, count);
  for (const [i, amount] of equalShares(total, count).entries())
    await db.query(
      "INSERT INTO bill_shares(id,visit_id,position,amount,tip) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(), id, i + 1, amount, tips[i]],
    );
}
export const adminDineRouter = Router();
adminDineRouter.use(requireStaff);
adminDineRouter.post("/visits/:id/split", async (req, res) => {
  const id = z.uuid().parse(req.params.id),
    count = z.number().int().min(1).max(20).parse(req.body.count);
  await transaction(async (db) => {
    const v = (
      await db.query(
        "SELECT * FROM dine_visits WHERE id=$1 AND status='OPEN' FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (!v) fail(409, "VISIT_CLOSED", "Посещение закрыто.");
    await createShares(db, id, count);
    await audit(db, req.session.user!.id, "BILL_SPLIT", id, null, { count });
  });
  res.json({ data: await visitView(pool, id, true), error: null });
});
adminDineRouter.get("/visits", async (_req, res) => {
  const rows = (
    await pool.query(
      "SELECT id FROM dine_visits WHERE status='OPEN' ORDER BY created_at",
    )
  ).rows;
  res.json({
    data: await Promise.all(rows.map((r) => visitView(pool, r.id, true))),
    error: null,
  });
});
adminDineRouter.post("/visits", async (req, res) => {
  const input = z
    .object({ tableId: z.uuid(), reservationId: z.uuid().optional() })
    .parse(req.body);
  const id = await transaction(async (db) => {
    const cfg = await config(db),
      now = localNow(cfg),
      settings = await v2Settings(db);
    if (!cfg.demo && !settings.floorPlanVerified)
      fail(409, "FLOOR_NOT_VERIFIED", "Сначала подтвердите схему зала.");
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "reservation-date:" + now.date,
    ]);
    const table = (
      await db.query(
        "SELECT * FROM qr_tables WHERE id=$1 AND active FOR UPDATE",
        [input.tableId],
      )
    ).rows[0];
    if (!table) fail(404, "NOT_FOUND", "Стол не найден.");
    const old = (
      await db.query(
        "SELECT id,reservation_id FROM dine_visits WHERE table_id=$1 AND status='OPEN'",
        [table.id],
      )
    ).rows[0];
    if (old) {
      if ((old.reservation_id ?? null) === (input.reservationId ?? null))
        return old.id;
      fail(409, "TABLE_BUSY", "За столом уже открыто другое посещение.");
    }
    let reservation;
    if (input.reservationId) {
      reservation = (
        await db.query("SELECT * FROM reservations WHERE id=$1 FOR UPDATE", [
          input.reservationId,
        ])
      ).rows[0];
      if (
        !reservation ||
        reservation.status !== "CONFIRMED" ||
        reservation.table_id !== table.id ||
        reservation.data.date !== now.date
      )
        fail(
          409,
          "RESERVATION_STATE",
          "Выберите сегодняшнюю подтверждённую бронь этого стола.",
        );
    }
    const conflicts = (
      await db.query(
        "SELECT id FROM reservations WHERE table_id=$1 AND date=$2 AND status IN ('PENDING','CONFIRMED','SEATED') AND start_minute<$3 AND end_minute>$4 AND ($5::uuid IS NULL OR id<>$5)",
        [
          table.id,
          now.date,
          now.minutes + cfg.reservationMinutes,
          now.minutes,
          input.reservationId ?? null,
        ],
      )
    ).rowCount;
    if (conflicts)
      fail(
        409,
        "TABLE_RESERVED",
        "В ближайшее время стол забронирован другими гостями.",
      );
    const id = randomUUID();
    await db.query(
      "INSERT INTO dine_visits(id,table_id,reservation_id,join_code) VALUES($1,$2,$3,$4)",
      [
        id,
        table.id,
        input.reservationId ?? null,
        String(randomInt(100000, 1000000)),
      ],
    );
    if (reservation) {
      await db.query("UPDATE reservations SET status='SEATED' WHERE id=$1", [
        reservation.id,
      ]);
      await db.query(
        "INSERT INTO dine_members(visit_id,owner,user_id) VALUES($1,$2,$3)",
        [id, reservation.owner, reservation.user_id],
      );
      if (reservation.data.preorder?.items?.length) {
        if (!cfg.orderingEnabled)
          fail(503, "ORDERING_DISABLED", "Приём заказов приостановлен.");
        // Check availability now, but honour the quote accepted when the reservation was created.
        priceCart(
          reservation.data.preorder.items,
          await dishes(db),
          cfg,
          { fulfillment: "DINE_IN", zoneId: "", promo: "", points: 0 },
          0,
        );
        const data = {
          ...reservation.data.preorder,
          fulfillment: "DINE_IN",
          tableName: table.name,
          reservationId: reservation.id,
          contact: {
            name: reservation.data.name,
            phone: reservation.data.phone,
            address: table.name,
            zoneId: "",
            time:
              "К брони " +
              reservationWhen({
                date: reservation.data.date,
                time: minuteTime(reservation.start_minute),
                endTime: minuteTime(reservation.end_minute),
              }) +
              ". " +
              restaurantClock(reservation.data.timezone, reservation.data.date),
            notes: reservation.data.notes,
          },
          demo: cfg.demo,
        };
        await db.query(
          "INSERT INTO orders(id,owner,user_id,idempotency_key,request_hash,data,visit_id) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            randomUUID(),
            reservation.owner,
            reservation.user_id,
            "preorder:" + reservation.id,
            hash(reservation.id),
            JSON.stringify(data),
            id,
          ],
        );
      }
    }
    await audit(db, req.session.user!.id, "VISIT_OPEN", id, null, {
      table: table.name,
      reservationId: input.reservationId,
    });
    return id;
  });
  res.status(201).json({ data: await visitView(pool, id, true), error: null });
});
adminDineRouter.post("/calls/:id/done", async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  await transaction(async (db) => {
    const r = await db.query(
      "UPDATE waiter_calls SET status='DONE' WHERE id=$1 RETURNING visit_id",
      [id],
    );
    if (!r.rowCount) fail(404, "NOT_FOUND", "Вызов не найден.");
    await audit(db, req.session.user!.id, "WAITER_CALL_DONE", id, null, {
      done: true,
    });
  });
  res.json({ data: { ok: true }, error: null });
});
adminDineRouter.delete("/visits/:id/split", async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  await transaction(async (db) => {
    await db.query("SELECT id FROM dine_visits WHERE id=$1 FOR UPDATE", [id]);
    if (
      (
        await db.query(
          "SELECT id FROM bill_shares WHERE visit_id=$1 AND (paid OR gift_paid>0)",
          [id],
        )
      ).rowCount
    )
      fail(
        409,
        "PAYMENT_EXISTS",
        "Часть счёта уже оплачена. Изменить разделение нельзя.",
      );
    await db.query("DELETE FROM bill_shares WHERE visit_id=$1", [id]);
    await audit(db, req.session.user!.id, "BILL_UNSPLIT", id, null, {
      reset: true,
    });
  });
  res.json({ data: { ok: true }, error: null });
});
adminDineRouter.post("/visits/:id/shares/:shareId/pay", async (req, res) => {
  const id = z.uuid().parse(req.params.id),
    shareId = z.uuid().parse(req.params.shareId);
  await transaction(async (db) => {
    const v = (
      await db.query(
        "SELECT * FROM dine_visits WHERE id=$1 AND status='OPEN' FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (!v) fail(409, "VISIT_CLOSED", "Посещение закрыто.");
    const share = (
      await db.query(
        "SELECT * FROM bill_shares WHERE id=$1 AND visit_id=$2 FOR UPDATE",
        [shareId, id],
      )
    ).rows[0];
    if (!share) fail(404, "NOT_FOUND", "Часть счёта не найдена.");
    if (share.paid) return;
    await db.query(
      "UPDATE bill_shares SET paid=true,paid_at=now() WHERE id=$1",
      [shareId],
    );
    if (
      !(
        await db.query(
          "SELECT id FROM bill_shares WHERE visit_id=$1 AND NOT paid",
          [id],
        )
      ).rowCount
    )
      await db.query(
        "UPDATE orders SET payment_status='PAID' WHERE visit_id=$1 AND status<>'CANCELLED'",
        [id],
      );
    await audit(db, req.session.user!.id, "BILL_SHARE_PAID", shareId, null, {
      amount: share.amount - share.gift_paid,
      tip: share.tip,
      visitId: id,
    });
  });
  res.json({ data: await visitView(pool, id, true), error: null });
});
adminDineRouter.post("/visits/:id/close", async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  await transaction(async (db) => {
    const v = (
      await db.query("SELECT * FROM dine_visits WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (!v) fail(404, "NOT_FOUND", "Посещение не найдено.");
    if (v.status === "CLOSED") return;
    if (
      (
        await db.query(
          "SELECT id FROM orders WHERE visit_id=$1 AND status NOT IN ('CANCELLED','COMPLETED')",
          [id],
        )
      ).rowCount
    )
      fail(
        409,
        "ORDERS_ACTIVE",
        "Сначала оплатите и завершите все заказы посещения.",
      );
    await db.query(
      "UPDATE dine_visits SET status='CLOSED',closed_at=now() WHERE id=$1",
      [id],
    );
    await db.query("UPDATE waiter_calls SET status='DONE' WHERE visit_id=$1", [
      id,
    ]);
    if (v.reservation_id)
      await db.query("UPDATE reservations SET status='COMPLETED' WHERE id=$1", [
        v.reservation_id,
      ]);
    await audit(db, req.session.user!.id, "VISIT_CLOSE", id, null, {
      closed: true,
    });
  });
  res.json({ data: { ok: true }, error: null });
});
