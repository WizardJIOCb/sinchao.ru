import { randomBytes } from "node:crypto";
import { pool, transaction } from "./db";
import type { Config } from "../shared/types";
import { importCatalog } from "./import-catalog";
import { contentSettings } from "./data/catalog";
export const restaurant: Config = {
  name: "Син Чао",
  tagline: "Маленькое путешествие во Вьетнам",
  address: "Октябрьский, Садовое кольцо, 16/1, 1 этаж",
  phone: "+79083516777",
  timezone: "Asia/Yekaterinburg",
  currency: "RUB",
  demo: true,
  orderingEnabled: true,
  openHour: 10,
  closeHour: 22,
  leadMinutes: 30,
  deliveryEta: "45–60 мин",
  pickupEta: "25–30 мин",
  zones: [
    {
      id: "garden",
      name: "Садовое кольцо — пример зоны",
      fee: 15000,
      minimum: 60000,
      streets: ["садовое кольцо"],
    },
  ],
  seating: ["Без предпочтений", "У окна", "Тихое место", "С детьми"],
  capacity: 24,
  reservationMinutes: 90,
  bookingDays: 30,
  maxGuests: 8,
  loyaltyPercent: 5,
  redemptionPercent: 30,
  promo: { code: "XINCHAO10", percent: 10, enabled: true },
  heroImage: "/images/pho.svg",
};
await transaction(async (db) => {
  await db.query(
    "INSERT INTO restaurant(id,data) VALUES(1,$1) ON CONFLICT DO NOTHING",
    [JSON.stringify({ ...restaurant, ...contentSettings })],
  );
  const imported = await importCatalog(db);
  console.log(
    imported
      ? "Imported owner's VK menu and photographs."
      : "Catalog already imported; staff edits preserved.",
  );
  if (!(await db.query("SELECT token FROM qr_tables LIMIT 1")).rowCount)
    for (let i = 1; i <= 6; i++)
      await db.query(
        "INSERT INTO qr_tables(token,name,x,y) VALUES($1,$2,$3,$4)",
        [
          randomBytes(24).toString("hex"),
          `Стол ${i}`,
          10 + ((i - 1) % 3) * 30,
          15 + Math.floor((i - 1) / 3) * 35,
        ],
      );
});
await pool.end();
