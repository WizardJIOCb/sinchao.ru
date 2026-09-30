import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import type { Dish } from "../shared/types";
import type { DB } from "./db";
import manifest from "./data/dish-images.json";

// Only replace the exact photographed region that was extracted. A later
// staff upload, crop adjustment or category change always takes precedence.
export function extractedDishImage(dish: Dish): Dish {
  const asset = manifest.find((entry) => entry.id === dish.id);
  if (
    !asset ||
    dish.image !== asset.source ||
    dish.categoryId !== asset.categoryId ||
    !isDeepStrictEqual(dish.imageCrop, asset.crop)
  )
    return dish;
  const { imageCrop: _crop, ...rest } = dish;
  return { ...rest, image: asset.image };
}

export async function migrateDishImages(db: DB) {
  await db.query("SELECT pg_advisory_xact_lock(912835)");
  const rows = (await db.query("SELECT id,data FROM dishes FOR UPDATE")).rows;
  const changed: string[] = [];
  for (const row of rows) {
    const after = extractedDishImage(row.data);
    if (after === row.data) continue;
    await db.query("UPDATE dishes SET data=$2 WHERE id=$1", [row.id, after]);
    await db.query(
      "INSERT INTO audit_logs(id,action,entity_id,before_data,after_data) VALUES($1,$2,$3,$4,$5)",
      [
        randomUUID(),
        "DISH_IMAGE_EXTRACTED",
        row.id,
        { image: row.data.image, imageCrop: row.data.imageCrop },
        { image: after.image },
      ],
    );
    changed.push(row.id);
  }
  return changed;
}
