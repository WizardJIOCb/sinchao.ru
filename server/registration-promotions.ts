import type { DB } from "./db";
import { audit, fail, notify } from "./lib";
import type { GrantedPromotion, Promotion } from "../shared/marketing";

export function promotionActive(p: Promotion, used: number) {
  return (
    p.enabled &&
    (!p.startsAt || Date.parse(p.startsAt) <= Date.now()) &&
    (!p.endsAt || Date.parse(p.endsAt) > Date.now()) &&
    (p.limit === null || used < p.limit)
  );
}
export async function grantRegistrationPromotion(db: DB, userId: string) {
  const rows = (
    await db.query(
      "SELECT code,data,used FROM promotions WHERE data->>'registrationGift'='true' FOR SHARE",
    )
  ).rows;
  const issued: string[] = [];
  for (const row of rows) {
    const p: Promotion = row.data;
    if (!promotionActive(p, row.used)) continue;
    const grant = await db.query(
      "INSERT INTO promotion_grants(user_id,code) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING code",
      [userId, row.code],
    );
    if (!grant.rowCount) continue;
    issued.push(row.code);
    const discount =
      p.kind === "fixed" ? `${(p.amount ?? 0) / 100} ₽` : `${p.percent}%`;
    await notify(
      db,
      userId,
      userId,
      "Подарок за регистрацию",
      `Ваш промокод ${p.code}: скидка ${discount} на блюда. Один заказ. Код сохранён в профиле.`,
      userId,
    );
    await audit(db, userId, "REGISTRATION_PROMO_GRANTED", p.code, null, {
      userId,
      source: "mobile_app",
    });
  }
  return issued;
}
export async function grantedPromotions(
  db: DB,
  userId: string,
): Promise<GrantedPromotion[]> {
  return (
    await db.query(
      "SELECT p.data,p.used,g.used_order_id FROM promotion_grants g JOIN promotions p ON p.code=g.code WHERE g.user_id=$1 ORDER BY g.created_at DESC",
      [userId],
    )
  ).rows.map((r) => ({
    ...r.data,
    usedByUser: !!r.used_order_id,
    available: !r.used_order_id && promotionActive(r.data, r.used),
  }));
}
export async function consumePromotion(
  db: DB,
  p: Promotion,
  userId: string | undefined,
  orderId: string,
) {
  if (p.requiresGrant || p.registrationGift) {
    const updated = await db.query(
      "UPDATE promotion_grants SET used_order_id=$3 WHERE user_id=$1 AND code=$2 AND used_order_id IS NULL",
      [userId, p.code, orderId],
    );
    if (updated.rowCount !== 1)
      fail(
        400,
        "PROMO_USED",
        "Этот промокод уже использован или не выдан вам.",
      );
  }
  await db.query("UPDATE promotions SET used=used+1 WHERE code=$1", [p.code]);
}
