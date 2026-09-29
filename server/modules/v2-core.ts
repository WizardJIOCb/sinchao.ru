import { randomBytes, randomUUID } from "node:crypto";
import type { DB } from "../db";
import { fail } from "../lib";
import type { V2Settings } from "../../shared/v2";

export async function v2Settings(db: DB): Promise<V2Settings> {
  return (await db.query("SELECT data FROM v2_settings WHERE id=1")).rows[0]
    .data;
}
export const newCode = () => randomBytes(12).toString("hex").toUpperCase();
export async function rewardReferral(db: DB, userId: string, orderId: string) {
  const ref = (
    await db.query("SELECT * FROM referrals WHERE invitee_id=$1 FOR UPDATE", [
      userId,
    ])
  ).rows[0];
  if (!ref || ref.rewarded_order_id) return;
  const settings = await v2Settings(db);
  if (!settings.referralsEnabled) return;
  // The invitee may have several concurrent orders: the referral row serializes reward issuance.
  await db.query(
    "UPDATE referrals SET rewarded_order_id=$1,reward_points=$2 WHERE invitee_id=$3",
    [orderId, settings.referralPoints, userId],
  );
  for (const id of [ref.inviter_id, userId]) {
    await db.query(
      "INSERT INTO loyalty_transactions(id,user_id,points,type,reference_id,description) VALUES($1,$2,$3,'REFERRAL',$4,'Бонус за первый заказ приглашённого гостя') ON CONFLICT DO NOTHING",
      [randomUUID(), id, settings.referralPoints, orderId],
    );
  }
}
export async function checkBillUnlocked(db: DB, visitId: string | null) {
  if (
    visitId &&
    (
      await db.query("SELECT id FROM bill_shares WHERE visit_id=$1 LIMIT 1", [
        visitId,
      ])
    ).rowCount
  )
    fail(
      409,
      "BILL_LOCKED",
      "Счёт уже разделён. Сотрудник должен отменить неоплаченное разделение перед изменением заказа.",
    );
}
export function equalShares(total: number, count: number) {
  if (
    !Number.isSafeInteger(total) ||
    total < 1 ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 20 ||
    count > total
  )
    fail(400, "SPLIT_COUNT", "Выберите от 1 до 20 частей счёта.");
  return Array.from(
    { length: count },
    (_, i) => Math.floor(total / count) + (i < total % count ? 1 : 0),
  );
}
