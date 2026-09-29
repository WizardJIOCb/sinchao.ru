import { createHash, randomUUID } from "node:crypto";
import type { DB } from "./db";
import type { Config, Dish } from "../shared/types";
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function fail(status: number, code: string, message: string): never {
  throw new ApiError(status, code, message);
}
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export async function config(db: DB): Promise<Config> {
  const r = await db.query("SELECT data FROM restaurant WHERE id=1");
  if (!r.rowCount) fail(503, "NOT_CONFIGURED", "Ресторан ещё настраивается.");
  return r.rows[0].data;
}
export async function dishes(db: DB): Promise<Dish[]> {
  return (await db.query("SELECT data FROM dishes ORDER BY position")).rows.map(
    (r) => r.data,
  );
}
export async function notify(
  db: DB,
  owner: string,
  userId: string | null,
  title: string,
  body: string,
  ref: string,
) {
  await db.query(
    "INSERT INTO notifications(id,owner,user_id,title,body,reference_id) VALUES($1,$2,$3,$4,$5,$6)",
    [randomUUID(), owner, userId, title, body, ref],
  );
}
export async function balance(db: DB, userId?: string | null): Promise<number> {
  if (!userId) return 0;
  return Number(
    (
      await db.query(
        "SELECT COALESCE(sum(points),0) AS balance FROM loyalty_transactions WHERE user_id=$1",
        [userId],
      )
    ).rows[0].balance,
  );
}
export async function audit(
  db: DB,
  actor: string,
  action: string,
  entity: string,
  before: unknown,
  after: unknown,
) {
  await db.query(
    "INSERT INTO audit_logs(id,actor_id,action,entity_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6)",
    [
      randomUUID(),
      actor,
      action,
      entity,
      JSON.stringify(before),
      JSON.stringify(after),
    ],
  );
}
export function localNow(c: Config) {
  const p = new Intl.DateTimeFormat("sv-SE", {
    timeZone: c.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
  return {
    date: p.slice(0, 10),
    minutes: Number(p.slice(11, 13)) * 60 + Number(p.slice(14, 16)),
  };
}
