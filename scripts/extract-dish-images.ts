import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
import type { Dish } from "../shared/types";

// Pixel-preserving extraction from an explicit catalog snapshot. Never fetches
// arbitrary URLs or overwrites source menu pages. Re-run with the same snapshot.
const input = process.argv[2];
if (!input)
  throw Error("Usage: tsx scripts/extract-dish-images.ts catalog.json");
const { dishes }: { dishes: Dish[] } = JSON.parse(
  await readFile(input, "utf8"),
);
await mkdir("public/images/dishes", { recursive: true });
const manifest = [];
for (const dish of dishes) {
  const c = dish.imageCrop;
  if (!c || !/^\/images\/vk-group\/[\w-]+\.jpg$/.test(dish.image)) continue;
  if (!/^[\w-]+$/.test(dish.id)) throw Error("Invalid dish ID");
  const source = await readFile("public" + dish.image);
  const meta = await sharp(source).metadata();
  if (meta.width !== c.sourceWidth || meta.height !== c.sourceHeight)
    throw Error("Source dimensions changed: " + dish.id);
  const { width: w, height: h } = c;
  const plate = !["drinks", "combos", "restaurant-only"].includes(
    dish.categoryId,
  );
  const shape = plate
    ? `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" fill="white"/>`
    : `<rect width="${w}" height="${h}" rx="${w * 0.18}" ry="${h * 0.12}" fill="white"/>`;
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${shape}</svg>`,
  );
  const image = await sharp(source)
    .extract({ left: c.x, top: c.y, width: w, height: h })
    .composite([{ input: mask, blend: "dest-in" }])
    .webp({ lossless: true })
    .toBuffer();
  const sha256 = createHash("sha256").update(image).digest("hex");
  const path = `/images/dishes/${dish.id}-${sha256.slice(0, 12)}.webp`;
  await writeFile("public" + path, image);
  manifest.push({
    id: dish.id,
    categoryId: dish.categoryId,
    source: dish.image,
    crop: c,
    image: path,
    sha256,
  });
}
await writeFile(
  "server/data/dish-images.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(`Extracted ${manifest.length} individual product images`);
