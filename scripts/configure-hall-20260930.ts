import { randomBytes, randomUUID } from "node:crypto";
import { pool, transaction } from "../server/db";

// Owner-approved inventory: 14 rectangular x 4, 3 round x 2, one VIP x 4.
// Run once after migration 006. Preserve existing IDs, QR tokens and bookings.
const action = "HALL_CONFIG_20260930";
try {
  const result = await transaction(async (db) => {
    await db.query("LOCK TABLE qr_tables IN SHARE ROW EXCLUSIVE MODE");
    if (
      (await db.query("SELECT id FROM audit_logs WHERE action=$1", [action]))
        .rowCount
    )
      return { alreadyApplied: true };
    const before = (
      await db.query(
        "SELECT id,name,seats,zone,shape,x,y,active FROM qr_tables ORDER BY name",
      )
    ).rows;
    const expected = [
      "Стол 1",
      "Стол 2",
      "Стол 3",
      "Стол 4",
      "Стол 5",
      "Стол 6",
      "Стол 67",
      "Новый стол",
    ];
    if (
      before.length !== expected.length ||
      expected.some(
        (name) => before.filter((t) => t.name === name).length !== 1,
      )
    )
      throw Error(
        "Table inventory changed; review before applying the hall layout.",
      );
    const plan = [
      ...Array.from({ length: 14 }, (_, i) => ({
        existing: i < 6 ? `Стол ${i + 1}` : i === 6 ? "Стол 67" : null,
        name: `Стол ${i + 1}`,
        seats: 4,
        shape: "square",
        zone: "Зал",
      })),
      ...Array.from({ length: 3 }, (_, i) => ({
        existing: null,
        name: `Круглый ${i + 1}`,
        seats: 2,
        shape: "round",
        zone: "Зал",
      })),
      {
        existing: "Новый стол",
        name: "VIP — длинный стол",
        seats: 4,
        shape: "long",
        zone: "VIP",
      },
    ];
    for (const [i, t] of plan.entries()) {
      const existing = before.find((r) => r.name === t.existing);
      const x = 5 + (i % 3) * 31,
        y = 4 + Math.floor(i / 3) * 15;
      if (existing) {
        const oversized = await db.query(
          "SELECT id FROM reservations WHERE table_id=$1 AND status IN ('PENDING','CONFIRMED','SEATED') AND date>=CURRENT_DATE AND party_size>$2 LIMIT 1",
          [existing.id, t.seats],
        );
        if (oversized.rowCount)
          throw Error(
            `Existing booking exceeds new capacity: ${existing.name}`,
          );
        await db.query(
          "UPDATE qr_tables SET name=$2,seats=$3,shape=$4,zone=$5,x=$6,y=$7,active=true WHERE id=$1",
          [existing.id, t.name, t.seats, t.shape, t.zone, x, y],
        );
      } else {
        await db.query(
          "INSERT INTO qr_tables(id,token,name,seats,shape,zone,x,y,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true)",
          [
            randomUUID(),
            randomBytes(24).toString("hex"),
            t.name,
            t.seats,
            t.shape,
            t.zone,
            x,
            y,
          ],
        );
      }
    }
    await db.query(
      "UPDATE restaurant SET data=jsonb_set(data,'{capacity}','66'::jsonb) WHERE id=1",
    );
    await db.query(
      "UPDATE v2_settings SET data=jsonb_set(data,'{floorPlanVerified}','false'::jsonb) WHERE id=1",
    );
    const after = (
      await db.query(
        "SELECT id,name,seats,zone,shape,x,y,active FROM qr_tables ORDER BY name",
      )
    ).rows;
    await db.query(
      "INSERT INTO audit_logs(id,actor_id,action,entity_id,before_data,after_data) VALUES($1,NULL,$2,'hall',$3,$4)",
      [
        randomUUID(),
        action,
        JSON.stringify(before),
        JSON.stringify({
          tables: after,
          capacity: 66,
          floorPlanVerified: false,
        }),
      ],
    );
    return {
      tables: after.length,
      seats: after.reduce((n, t) => n + t.seats, 0),
      rectangular: 14,
      round: 3,
      vip: 1,
    };
  });
  console.log(JSON.stringify(result));
} finally {
  await pool.end();
}
