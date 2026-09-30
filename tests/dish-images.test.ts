import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
import manifest from "../server/data/dish-images.json";
import {
  extractedDishImage,
  migrateDishImages,
} from "../server/dish-image-migration";
import { menu } from "../server/data/catalog";
import { pool, transaction } from "../server/db";

test("All extracted photographs retain their original size, alpha mask and content hash", async () => {
  assert.equal(manifest.length, 56);
  for (const asset of manifest) {
    const bytes = await readFile("public" + asset.image);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      asset.sha256,
    );
    const meta = await sharp(bytes).metadata();
    assert.equal(meta.width, asset.crop.width);
    assert.equal(meta.height, asset.crop.height);
    assert.equal(meta.hasAlpha, true);
  }
});

test("Image migration preserves staff data, skips replacements and is idempotent", async () => {
  const asset = manifest[0];
  const original = {
    ...menu[0],
    image: asset.source,
    imageCrop: asset.crop,
    price: 12345,
    name: "Изменено сотрудником",
  };
  const updated = extractedDishImage(original);
  assert.equal(updated.image, asset.image);
  assert.equal(updated.imageCrop, undefined);
  assert.equal(updated.price, original.price);
  assert.equal(updated.name, original.name);
  assert.deepEqual(updated.modifiers, original.modifiers);
  assert.equal(extractedDishImage(updated), updated);
  const upload = { ...original, image: "/images/uploads/new.webp" };
  assert.equal(extractedDishImage(upload), upload);
  const cropEdit = {
    ...original,
    imageCrop: { ...asset.crop, x: asset.crop.x + 1 },
  };
  assert.equal(extractedDishImage(cropEdit), cropEdit);
  const recategorized = { ...original, categoryId: "drinks" };
  assert.equal(extractedDishImage(recategorized), recategorized);

  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
    throw Error("Test DB required");
  try {
    await transaction(async (db) => {
      // The preceding suite may have replaced the catalog. Seed the fixture
      // inside this rollback transaction instead of relying on an existing row.
      await db.query(
        "INSERT INTO dishes(id,data,position) VALUES($1,$2,0) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data",
        [original.id, original],
      );
      assert.ok((await migrateDishImages(db)).includes(original.id));
      assert.deepEqual(
        (await db.query("SELECT data FROM dishes WHERE id=$1", [original.id]))
          .rows[0].data,
        updated,
      );
      assert.deepEqual(await migrateDishImages(db), []);
      await db.query("UPDATE dishes SET data=$2 WHERE id=$1", [
        upload.id,
        upload,
      ]);
      assert.deepEqual(await migrateDishImages(db), []);
      throw Error("ROLLBACK_TEST");
    }).catch((e) => {
      if (e.message !== "ROLLBACK_TEST") throw e;
    });
  } finally {
    await pool.end();
  }
});
