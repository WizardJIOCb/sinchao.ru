import { Router } from "express";
import { z } from "zod";
import { pool, transaction, type DB } from "../db";
import { audit, dishes, fail } from "../lib";
import { requireManager } from "./auth";
import { dishAchievements } from "../dish-achievements";
import { generalDefaults } from "../general-achievements";
import {
  achievementImageSchema,
  validateAchievementImage,
} from "../achievement-images";
import type { GeneralAchievementRule } from "../../shared/marketing";
export async function generalRules(db: DB): Promise<GeneralAchievementRule[]> {
  return (
    await db.query("SELECT data FROM general_achievement_rules")
  ).rows.map((r) => r.data);
}
import type { AchievementRule, Promotion } from "../../shared/marketing";

export async function achievementRules(db: DB): Promise<AchievementRule[]> {
  return (await db.query("SELECT data FROM dish_achievement_rules")).rows.map(
    (r) => r.data,
  );
}
export async function resolvePromotion(
  db: DB,
  code: string,
  lock = false,
): Promise<Promotion | undefined> {
  if (!code.trim()) return;
  const row = (
    await db.query(
      `SELECT data,used FROM promotions WHERE code=$1 ${lock ? "FOR UPDATE" : ""}`,
      [code.trim().toUpperCase()],
    )
  ).rows[0];
  if (!row) return; // Preserve the existing restaurant-wide legacy code.
  const p: Promotion = { ...row.data, used: row.used };
  const now = Date.now();
  if (
    !p.enabled ||
    (p.startsAt && Date.parse(p.startsAt) > now) ||
    (p.endsAt && Date.parse(p.endsAt) <= now) ||
    (p.limit !== null && row.used >= p.limit)
  )
    fail(
      400,
      "INVALID_PROMO",
      "Промокод не действует или лимит использований исчерпан.",
    );
  return p;
}
const promoSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-ZА-ЯЁ0-9_-]{2,30}$/u),
    title: z.string().trim().min(1).max(100),
    percent: z.number().int().min(0).max(100),
    dishIds: z.array(z.string().max(80)).max(100),
    enabled: z.boolean(),
    startsAt: z.iso.datetime().nullable(),
    endsAt: z.iso.datetime().nullable(),
    limit: z.number().int().min(1).max(1000000).nullable(),
    minSubtotal: z.number().int().min(0).max(100000000),
  })
  .refine(
    (p) => !p.enabled || p.percent > 0,
    "Укажите скидку перед включением промокода.",
  )
  .refine(
    (p) => !p.startsAt || !p.endsAt || p.startsAt < p.endsAt,
    "Окончание должно быть позже начала.",
  );
const ruleSchema = z.object({
  image: achievementImageSchema,
  dishId: z.string().max(80),
  name: z.string().trim().min(1).max(100),
  enabled: z.boolean(),
  milestones: z
    .array(z.number().int().min(1).max(10000))
    .length(5)
    .refine(
      (values) => values.every((v, i) => i === 0 || v > values[i - 1]),
      "Пять порогов должны идти по возрастанию.",
    ),
});
export const marketingRouter = Router();
marketingRouter.use(requireManager);
marketingRouter.get("/", async (_req, res) => {
  const rules = await achievementRules(pool);
  const common = await generalRules(pool);
  const defaults = dishAchievements(await dishes(pool), []);
  res.json({
    data: {
      generalRules: generalDefaults.map(
        (d) =>
          common.find((r) => r.id === d.id) ?? {
            id: d.id,
            name: d.name,
            enabled: true,
            milestones: d.milestones,
          },
      ),
      promotions: (
        await pool.query("SELECT data,used FROM promotions ORDER BY code")
      ).rows.map((r) => ({ ...r.data, used: r.used })),
      rules: defaults.map(
        (a) =>
          rules.find((r) => r.dishId === a.dish.id) ?? {
            dishId: a.dish.id,
            name: a.name,
            enabled: true,
            milestones: a.milestones,
          },
      ),
    },
    error: null,
  });
});
marketingRouter.put("/general-achievements/:id", async (req, res) => {
  const input = ruleSchema
    .omit({ dishId: true })
    .extend({ id: z.string() })
    .parse(req.body);
  await validateAchievementImage(input.image);
  if (
    input.id !== req.params.id ||
    !generalDefaults.some((d) => d.id === input.id)
  )
    fail(400, "ACHIEVEMENT_ID", "Достижение не найдено.");
  await transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "general-achievement:" + input.id,
    ]);
    const before = (
      await db.query("SELECT data FROM general_achievement_rules WHERE id=$1", [
        input.id,
      ])
    ).rows[0];
    await db.query(
      "INSERT INTO general_achievement_rules(id,data) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET data=$2",
      [input.id, JSON.stringify(input)],
    );
    await audit(
      db,
      req.session.user!.id,
      "GENERAL_ACHIEVEMENT_UPDATE",
      input.id,
      before?.data ?? null,
      input,
    );
  });
  res.json({ data: input, error: null });
});
marketingRouter.put("/promotions/:code", async (req, res) => {
  const p = promoSchema.parse(req.body);
  if (p.code !== req.params.code)
    fail(400, "PROMO_CODE", "Код в адресе и форме должен совпадать.");
  const menu = await dishes(pool);
  if (
    p.dishIds.some(
      (id) => !menu.some((d) => d.id === id && d.orderable !== false),
    )
  )
    fail(400, "PROMO_DISH", "Выберите доступные для заказа блюда.");
  await transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "promo:" + p.code,
    ]);
    const before = (
      await db.query(
        "SELECT data,used FROM promotions WHERE code=$1 FOR UPDATE",
        [p.code],
      )
    ).rows[0];
    await db.query(
      "INSERT INTO promotions(code,data) VALUES($1,$2) ON CONFLICT(code) DO UPDATE SET data=$2",
      [p.code, JSON.stringify(p)],
    );
    await audit(
      db,
      req.session.user!.id,
      "PROMOTION_UPDATE",
      p.code,
      before ?? null,
      p,
    );
  });
  res.json({ data: p, error: null });
});
marketingRouter.put("/achievements/:dishId", async (req, res) => {
  const rule = ruleSchema.parse(req.body);
  await validateAchievementImage(rule.image);
  const defaults = dishAchievements(await dishes(pool), []);
  if (
    rule.dishId !== req.params.dishId ||
    !defaults.some((a) => a.dish.id === rule.dishId)
  )
    fail(400, "ACHIEVEMENT_DISH", "Блюдо не найдено.");
  await transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "achievement:" + rule.dishId,
    ]);
    const before = (
      await db.query(
        "SELECT data FROM dish_achievement_rules WHERE dish_id=$1",
        [rule.dishId],
      )
    ).rows[0];
    await db.query(
      "INSERT INTO dish_achievement_rules(dish_id,data) VALUES($1,$2) ON CONFLICT(dish_id) DO UPDATE SET data=$2",
      [rule.dishId, JSON.stringify(rule)],
    );
    await audit(
      db,
      req.session.user!.id,
      "ACHIEVEMENT_UPDATE",
      rule.dishId,
      before?.data ?? null,
      rule,
    );
  });
  res.json({ data: rule, error: null });
});
