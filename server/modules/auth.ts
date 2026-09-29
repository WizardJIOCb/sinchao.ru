import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import { pool, transaction } from "../db";
import { fail, hash } from "../lib";
import type { CartItem, User } from "../../shared/types";
const scrypt = promisify(scryptCallback);
export type Session = { id: string; user: User | null; cart: CartItem[] };
declare global {
  namespace Express {
    interface Request {
      session: Session;
    }
  }
}
export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return (
    salt + ":" + ((await scrypt(password, salt, 64)) as Buffer).toString("hex")
  );
}
async function passwordMatches(password: string, stored: string) {
  const [salt, digest] = stored.split(":");
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  return timingSafeEqual(actual, Buffer.from(digest, "hex"));
}
const cookie = (res: Response, token: string) =>
  res.cookie("sid", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 86400000,
  });
export async function session(req: Request, res: Response, next: NextFunction) {
  const raw = req.headers.cookie
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("sid="))
    ?.slice(4);
  let row;
  if (raw && /^[a-f0-9]{64}$/.test(raw))
    row = (
      await pool.query(
        "SELECT s.*,u.id uid,u.email,u.name,u.phone,u.role FROM sessions s LEFT JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.expires_at>now()",
        [hash(raw)],
      )
    ).rows[0];
  if (!row) {
    const token = randomBytes(32).toString("hex");
    const id = hash(token);
    await pool.query("INSERT INTO sessions(id) VALUES($1)", [id]);
    cookie(res, token);
    row = { id, cart: [] };
  }
  req.session = {
    id: row.id,
    cart: row.cart,
    user: row.uid
      ? {
          id: row.uid,
          email: row.email,
          name: row.name,
          phone: row.phone,
          role: row.role,
        }
      : null,
  };
  next();
}
export const owner = (req: Request) => req.session.user?.id ?? req.session.id;
export function requireUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.session.user) fail(401, "LOGIN_REQUIRED", "Войдите в аккаунт.");
  next();
}
export function requireStaff(req: Request, _res: Response, next: NextFunction) {
  if (
    !req.session.user ||
    !["STAFF", "MANAGER", "ADMIN"].includes(req.session.user.role)
  )
    fail(403, "FORBIDDEN", "Доступ только для сотрудников.");
  next();
}
export function requireManager(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  if (
    !req.session.user ||
    !["MANAGER", "ADMIN"].includes(req.session.user.role)
  )
    fail(403, "FORBIDDEN", "Требуются права управляющего.");
  next();
}
async function signIn(req: Request, res: Response, userId: string) {
  const token = randomBytes(32).toString("hex");
  const id = hash(token);
  await transaction(async (db) => {
    await db.query("INSERT INTO sessions(id,user_id,cart) VALUES($1,$2,$3)", [
      id,
      userId,
      JSON.stringify(req.session.cart),
    ]);
    await db.query(
      "UPDATE orders SET user_id=$1 WHERE owner=$2 AND user_id IS NULL",
      [userId, req.session.id],
    );
    await db.query(
      "UPDATE reservations SET user_id=$1 WHERE owner=$2 AND user_id IS NULL",
      [userId, req.session.id],
    );
    await db.query(
      "UPDATE notifications SET user_id=$1 WHERE owner=$2 AND user_id IS NULL",
      [userId, req.session.id],
    );
    await db.query("DELETE FROM sessions WHERE id=$1", [req.session.id]);
    await db.query(
      "UPDATE dine_members SET user_id=$1 WHERE owner=$2 AND user_id IS NULL",
      [userId, req.session.id],
    );
  });
  cookie(res, token);
}
const credentials = z.object({
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z
    .string()
    .min(10, "Пароль должен содержать минимум 10 символов")
    .max(200),
});
export const authRouter = Router();
authRouter.post("/register", async (req, res) => {
  const input = credentials
    .extend({
      name: z.string().trim().min(2).max(100),
      phone: z.string().max(30).default(""),
    })
    .parse(req.body);
  const id = randomUUID();
  const pw = await passwordHash(input.password);
  try {
    await pool.query(
      "INSERT INTO users(id,email,password_hash,name,phone) VALUES($1,$2,$3,$4,$5)",
      [id, input.email, pw, input.name, input.phone],
    );
  } catch (e: any) {
    if (e.code === "23505")
      fail(409, "EMAIL_EXISTS", "Этот email уже зарегистрирован.");
    throw e;
  }
  await signIn(req, res, id);
  res.status(201).json({ data: { id }, error: null });
});
authRouter.post("/login", async (req, res) => {
  const input = credentials.parse(req.body);
  const u = (
    await pool.query("SELECT * FROM users WHERE email=$1", [input.email])
  ).rows[0];
  const fallback = "00000000000000000000000000000000:" + "0".repeat(128);
  if (
    !(await passwordMatches(input.password, u?.password_hash ?? fallback)) ||
    !u
  )
    fail(401, "BAD_CREDENTIALS", "Неверный email или пароль.");
  await signIn(req, res, u.id);
  res.json({ data: { id: u.id }, error: null });
});
authRouter.post("/logout", async (req, res) => {
  await pool.query("DELETE FROM sessions WHERE id=$1", [req.session.id]);
  res.clearCookie("sid", { path: "/" });
  res.json({ data: { ok: true }, error: null });
});
