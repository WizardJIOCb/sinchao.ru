import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import manifest from "../server/data/dish-images.json";
import { pool, transaction } from "../server/db";
import { migrateDishImages } from "../server/dish-image-migration";

try {
  // Verify all deployed assets before changing a single database record.
  for (const asset of manifest) {
    const bytes = await readFile("dist/public" + asset.image);
    if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256)
      throw Error("Missing or changed extracted asset: " + asset.id);
  }
  const changed = await transaction(migrateDishImages);
  console.log(JSON.stringify({ changed: changed.length, ids: changed }));
} finally {
  await pool.end();
}
