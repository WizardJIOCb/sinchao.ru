import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { resolve } from "node:path";
import { pool } from "./db";
import { ApiError, balance, config, dishes, fail } from "./lib";
import { authRouter, owner, requireUser, session } from "./modules/auth";
import { cartRouter } from "./modules/cart";
import { ordersRouter } from "./modules/orders";
import { reservationsRouter } from "./modules/reservations";
import { adminRouter } from "./modules/admin";
import { tablesRouter, adminTablesRouter } from "./modules/tables";
import { dineRouter, adminDineRouter } from "./modules/dine-in";
import { discoveryRouter } from "./modules/discovery";
import { eventsRouter, adminEventsRouter } from "./modules/events";
import { giftsRouter, adminGiftsRouter } from "./modules/gifts";
import { marketingRouter } from "./modules/marketing";
import { staffAdminRouter } from "./modules/staff-admin";
export const app = express();
app.set("trust proxy", "loopback");
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "https:", "data:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests:
          process.env.NODE_ENV === "production" ? [] : null,
      },
    },
  }),
);
app.use(express.json({ limit: "150kb" }));
app.get("/api/health", async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ data: { status: "ok", version: "2.0.0" }, error: null });
});
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 240,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      data: null,
      error: {
        code: "RATE_LIMIT",
        message: "Слишком много запросов. Попробуйте через минуту.",
      },
    },
  }),
);
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.origin;
    if (origin && origin !== process.env.APP_ORIGIN)
      fail(403, "CSRF", "Запрос с другого сайта запрещён.");
    if (req.headers["sec-fetch-site"] === "cross-site")
      fail(403, "CSRF", "Запрос с другого сайта запрещён.");
    if (!req.is("application/json"))
      fail(415, "CONTENT_TYPE", "Требуется JSON.");
  }
  next();
});
app.use("/api", session);
app.use(
  "/api/auth",
  rateLimit({
    windowMs: 15 * 60000,
    limit: 25,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      data: null,
      error: {
        code: "AUTH_RATE_LIMIT",
        message: "Слишком много попыток входа. Попробуйте позже.",
      },
    },
  }),
  authRouter,
);
app.get("/api/me", async (req, res) =>
  res.json({
    data: {
      user: req.session.user,
      balance: await balance(pool, req.session.user?.id),
    },
    error: null,
  }),
);
app.patch("/api/me", requireUser, async (req, res) => {
  const input = z
    .object({
      name: z.string().trim().min(2).max(100),
      phone: z.string().max(30),
    })
    .parse(req.body);
  await pool.query("UPDATE users SET name=$1,phone=$2 WHERE id=$3", [
    input.name,
    input.phone,
    req.session.user!.id,
  ]);
  res.json({ data: { ...req.session.user, ...input }, error: null });
});
app.get("/api/menu", async (_req, res) => {
  const cfg = await config(pool);
  res.json({
    data: {
      config: cfg,
      categories: (
        await pool.query("SELECT data FROM categories ORDER BY position")
      ).rows.map((r) => r.data),
      dishes: await dishes(pool),
    },
    error: null,
  });
});
app.get("/api/categories", async (_req, res) =>
  res.json({
    data: (
      await pool.query("SELECT data FROM categories ORDER BY position")
    ).rows.map((r) => r.data),
    error: null,
  }),
);
app.get("/api/dishes/:id", async (req, res) => {
  const row = (
    await pool.query("SELECT data FROM dishes WHERE id=$1", [req.params.id])
  ).rows[0];
  if (!row) fail(404, "NOT_FOUND", "Блюдо не найдено.");
  res.json({ data: row.data, error: null });
});
app.use("/api/cart", cartRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/reservations", reservationsRouter);
app.use("/api/admin", adminRouter);
app.use(
  "/api/v2",
  tablesRouter,
  dineRouter,
  discoveryRouter,
  eventsRouter,
  giftsRouter,
);
app.use("/api/admin/marketing", marketingRouter);
app.use("/api/admin", staffAdminRouter);
app.use(
  "/api/admin/v2",
  adminTablesRouter,
  adminDineRouter,
  adminEventsRouter,
  adminGiftsRouter,
);
app.get(["/api/loyalty", "/api/loyalty/transactions"], async (req, res) =>
  res.json({
    data: {
      balance: await balance(pool, req.session.user?.id),
      transactions: req.session.user
        ? (
            await pool.query(
              "SELECT id,points,type,description,created_at FROM loyalty_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
              [req.session.user.id],
            )
          ).rows
        : [],
    },
    error: null,
  }),
);
app.get("/api/notifications", async (req, res) =>
  res.json({
    data: (
      await pool.query(
        "SELECT id,title,body,read_at,created_at FROM notifications WHERE owner=$1 OR user_id=$2 ORDER BY created_at DESC LIMIT 50",
        [owner(req), req.session.user?.id ?? null],
      )
    ).rows,
    error: null,
  }),
);
app.post("/api/notifications/read", async (req, res) => {
  await pool.query(
    "UPDATE notifications SET read_at=now() WHERE read_at IS NULL AND (owner=$1 OR user_id=$2)",
    [owner(req), req.session.user?.id ?? null],
  );
  res.json({ data: { ok: true }, error: null });
});
app.get("/api/dine-in/:token", async (req, res) => {
  const row = (
    await pool.query(
      "SELECT name FROM qr_tables WHERE token=$1 AND active=true",
      [req.params.token],
    )
  ).rows[0];
  if (!row)
    fail(404, "QR_NOT_FOUND", "QR-код не найден. Обратитесь к сотруднику.");
  res.json({
    data: {
      table: row.name,
      ordering: true,
      message: "Введите код визита у официанта, чтобы заказать за столом.",
    },
    error: null,
  });
});
app.post("/api/analytics", async (req, res) => {
  const event = z
    .enum([
      "app_open",
      "menu_view",
      "category_view",
      "dish_view",
      "add_to_cart",
      "remove_from_cart",
      "checkout_started",
      "order_created",
      "order_completed",
      "reorder_clicked",
      "reservation_started",
      "reservation_created",
      "reservation_cancelled",
      "qr_opened",
    ])
    .parse(req.body.event);
  await pool.query("INSERT INTO analytics(event_name) VALUES($1)", [event]);
  res.json({ data: { ok: true }, error: null });
});
app.use("/api", (_req, res) =>
  res.status(404).json({
    data: null,
    error: { code: "NOT_FOUND", message: "Маршрут не найден." },
  }),
);
app.use(express.static(resolve("dist/public"), { maxAge: "1h", index: false }));
app.get("/{*path}", (_req, res) =>
  res.sendFile(resolve("dist/public/index.html")),
);
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        data: null,
        error: {
          code: "VALIDATION",
          message: err.issues.map((i) => i.message).join("; "),
        },
      });
      return;
    }
    if (err instanceof ApiError) {
      res
        .status(err.status)
        .json({ data: null, error: { code: err.code, message: err.message } });
      return;
    }
    if (err.type === "entity.parse.failed") {
      res.status(400).json({
        data: null,
        error: { code: "INVALID_JSON", message: "Некорректный JSON." },
      });
      return;
    }
    console.error("Request failed:", err.code ?? err.name, err.message);
    res.status(500).json({
      data: null,
      error: {
        code: "INTERNAL",
        message: "Не удалось выполнить запрос. Попробуйте ещё раз.",
      },
    });
  },
);
