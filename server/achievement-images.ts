import type { Request, Response } from "express";
import { z } from "zod";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { pool } from "./db";
import { fail } from "./lib";

const prefix = "/images/uploads/";
export const achievementImageSchema = z
  .string()
  .regex(/^\/images\/uploads\/[a-f0-9]{64}\.webp$/)
  .nullable()
  .optional();
export async function validateAchievementImage(image?: string | null) {
  if (
    image &&
    !(
      await pool.query("SELECT id FROM uploaded_images WHERE id=$1", [
        image.slice(prefix.length, -5),
      ])
    ).rowCount
  )
    fail(400, "IMAGE_NOT_FOUND", "Картинка не найдена. Загрузите её заново.");
}
export async function uploadAchievementImage(req: Request, res: Response) {
  const { base64, kind } = z
    .object({
      base64: z
        .string()
        .min(4)
        .max(136536)
        .regex(/^[A-Za-z0-9+/]+={0,2}$/),
      kind: z.enum(["achievement", "dish"]).default("achievement"),
    })
    .parse(req.body);
  const source = Buffer.from(base64, "base64");
  if (source.length > 102400)
    fail(413, "IMAGE_SIZE", "Картинка слишком большая. Выберите другой файл.");
  let content: Buffer;
  try {
    const pipeline = sharp(source, {
      limitInputPixels: 16777216,
      failOn: "warning",
    });
    const meta = await pipeline.metadata();
    if (
      !meta.format ||
      !["jpeg", "png", "webp"].includes(meta.format) ||
      (meta.pages ?? 1) > 1
    )
      throw Error("format");
    const size = kind === "dish" ? 1024 : 512;
    const resized = pipeline
      .rotate()
      .resize(size, size, {
        fit: kind === "dish" ? "inside" : "cover",
        withoutEnlargement: true,
      });
    content = await resized.clone().webp({ quality: 80 }).toBuffer();
    if (content.length > 102400)
      content = await resized.clone().webp({ quality: 60 }).toBuffer();
  } catch {
    return fail(
      400,
      "IMAGE_FORMAT",
      "Не удалось прочитать картинку. Используйте JPG, PNG или WebP без анимации.",
    );
  }
  if (content.length > 102400)
    fail(
      413,
      "IMAGE_SIZE",
      "Картинка слишком сложная. Выберите изображение меньшего размера.",
    );
  const id = createHash("sha256").update(content).digest("hex");
  await pool.query(
    "INSERT INTO uploaded_images(id,content,created_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
    [id, content, req.session.user!.id],
  );
  res.status(201).json({ data: { image: prefix + id + ".webp" }, error: null });
}
export async function serveAchievementImage(req: Request, res: Response) {
  const id = String(req.params.file).replace(/\.webp$/, "");
  if (!/^[a-f0-9]{64}$/.test(id) || !String(req.params.file).endsWith(".webp"))
    return res.sendStatus(404);
  const row = (
    await pool.query("SELECT content FROM uploaded_images WHERE id=$1", [id])
  ).rows[0];
  if (!row) return res.sendStatus(404);
  res
    .type("image/webp")
    .set("Cache-Control", "public, max-age=31536000, immutable")
    .set("ETag", '"' + id + '"')
    .send(row.content);
}
