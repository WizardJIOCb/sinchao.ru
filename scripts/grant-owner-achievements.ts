import { randomUUID } from "node:crypto";
import { pool, transaction } from "../server/db";

// Explicit owner request, 2026-09-30. Re-running this grant is idempotent.
const grantKey = "owner-request-2026-09-30";
const targets = [
  {
    name: "Rodion",
    email: "rodion89@list.ru",
    progress: {
      "pho-bo": 7,
      "tom-yam": 4,
      "tea-pot": 9,
      water: 2,
      "fruit-juice": 3,
      "soda-can": 1,
    },
  },
  {
    name: "Marat",
    email: "rakisolo@gmail.com",
    progress: {
      "pho-bo": 4,
      "tom-yam": 2,
      "tea-pot": 3,
      water: 7,
      "fruit-juice": 1,
      "soda-can": 5,
    },
  },
];
try {
  await transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(912835)");
    for (const target of targets) {
      const users = (
        await db.query("SELECT id,name FROM users WHERE lower(email)=$1", [
          target.email,
        ])
      ).rows;
      if (users.length !== 1 || users[0].name !== target.name)
        throw Error("Account identity mismatch: " + target.name);
      for (const [dishId, progress] of Object.entries(target.progress)) {
        const inserted = await db.query(
          "INSERT INTO achievement_grants(user_id,grant_key,dish_id,progress,reason) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING progress",
          [
            users[0].id,
            grantKey,
            dishId,
            progress,
            "Подарочный прогресс по запросу владельца",
          ],
        );
        if (!inserted.rowCount) {
          const existing = (
            await db.query(
              "SELECT progress FROM achievement_grants WHERE user_id=$1 AND grant_key=$2 AND dish_id=$3",
              [users[0].id, grantKey, dishId],
            )
          ).rows[0];
          if (existing.progress !== progress)
            throw Error(
              "Existing grant differs: " + target.name + "/" + dishId,
            );
        } else {
          await db.query(
            "INSERT INTO audit_logs(id,actor_id,action,entity_id,after_data) VALUES($1,NULL,$2,$3,$4)",
            [
              randomUUID(),
              "ACHIEVEMENT_GRANT",
              users[0].id + "/" + dishId,
              { grantKey, dishId, progress, source: "owner-request" },
            ],
          );
        }
      }
      console.log(target.name + ": six achievement grants verified");
    }
  });
} finally {
  await pool.end();
}
