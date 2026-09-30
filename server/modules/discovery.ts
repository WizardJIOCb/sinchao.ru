import { Router } from "express";
import { z } from "zod";
import { pool, transaction } from "../db";
import { dishes, fail } from "../lib";
import { requireUser } from "./auth";
import { newCode, v2Settings } from "./v2-core";
import type { Preferences } from "../../shared/v2";
import { dishAchievements } from "../dish-achievements";
import { achievementRules, generalRules } from "./marketing";
import { generalAchievements } from "../general-achievements";

export const discoveryRouter = Router();
discoveryRouter.get("/discovery", async (req, res) => {
  const menu = await dishes(pool),
    userId = req.session.user?.id;
  const prefs = userId
    ? (
        await pool.query(
          "SELECT * FROM customer_preferences WHERE user_id=$1",
          [userId],
        )
      ).rows[0]
    : null;
  const preferences: Preferences = {
    favorites: prefs?.favorites ?? [],
    maxSpice: prefs?.max_spice ?? 3,
    avoidAllergens: prefs?.avoid_allergens ?? [],
  };
  const orders = userId
    ? (
        await pool.query(
          "SELECT data FROM orders WHERE user_id=$1 AND status='COMPLETED' AND payment_status='PAID' ORDER BY created_at DESC",
          [userId],
        )
      ).rows
    : [];
  const tried = new Set<string>(
    orders.flatMap((o) => o.data.items.map((i: any) => i.dishId)),
  );
  const awarded: Record<string, number> = userId
    ? Object.fromEntries(
        (
          await pool.query(
            "SELECT dish_id, sum(progress)::integer AS progress FROM achievement_grants WHERE user_id=$1 GROUP BY dish_id",
            [userId],
          )
        ).rows.map((r) => [r.dish_id, r.progress]),
      )
    : {};
  const closedVisits = userId
    ? ((
        await pool.query(
          "SELECT v.id FROM dine_visits v WHERE v.status='CLOSED' AND EXISTS(SELECT 1 FROM orders o WHERE o.visit_id=v.id AND o.user_id=$1 AND o.status='COMPLETED' AND o.payment_status='PAID')",
          [userId],
        )
      ).rowCount ?? 0)
    : 0;
  const tippedVisits = userId
    ? ((
        await pool.query(
          "SELECT v.id FROM dine_visits v WHERE v.status='CLOSED' AND v.tip_user_id=$1 AND EXISTS(SELECT 1 FROM bill_shares b WHERE b.visit_id=v.id AND b.paid AND b.tip>0) AND NOT EXISTS(SELECT 1 FROM bill_shares b WHERE b.visit_id=v.id AND NOT b.paid)",
          [userId],
        )
      ).rowCount ?? 0)
    : 0;
  const regular = orders.filter((o) => o.data.fulfillment !== "DINE_IN");
  const common = generalAchievements(
    {
      bills: regular.length + closedVisits,
      tips: regular.filter((o) => (o.data.tip ?? 0) > 0).length + tippedVisits,
      delivery: regular.filter((o) => o.data.fulfillment === "DELIVERY").length,
      pickup: regular.filter((o) => o.data.fulfillment === "PICKUP").length,
    },
    await generalRules(pool),
  );
  const liked = menu.filter(
    (d) => preferences.favorites.includes(d.id) || tried.has(d.id),
  );
  const eligible = menu.filter(
    (d) =>
      d.available &&
      d.orderable !== false &&
      d.spice <= preferences.maxSpice &&
      (!preferences.avoidAllergens.length ||
        (d.allergens.length > 0 &&
          !d.allergens.some((a) =>
            preferences.avoidAllergens.some(
              (p) => p.toLowerCase() === a.toLowerCase(),
            ),
          ))),
  );
  const ranked = eligible
    .map((d) => {
      const related = liked.find(
        (l) => l.id !== d.id && l.categoryId === d.categoryId,
      );
      const favorite = preferences.favorites.includes(d.id);
      return {
        dish: d,
        score:
          (favorite ? 10 : 0) +
          (related ? 6 : 0) +
          (d.featured ? 2 : 0) +
          (tried.has(d.id) ? 0 : 1),
        reason: favorite
          ? "Вы сохранили это блюдо"
          : related
            ? `В той же категории, что и «${related.name}»`
            : d.featured
              ? "Ресторан рекомендует"
              : "Для нового знакомства с меню",
      };
    })
    .sort((a, b) => b.score - a.score || a.dish.name.localeCompare(b.dish.name))
    .slice(0, 6)
    .map(({ dish, reason }) => ({ dish, reason }));
  const food = menu.filter(
    (d) => d.orderable !== false && !/drink|napit/i.test(d.categoryId),
  );
  const regions = [
    ...new Set(food.map((d) => d.region || "Знакомство с кухней Вьетнама")),
  ];
  const journey = regions.map((region) => {
    const entries = food
      .filter((d) => (d.region || "Знакомство с кухней Вьетнама") === region)
      .map((d) => ({ id: d.id, name: d.name, tried: tried.has(d.id) }));
    return {
      region,
      dishes: entries,
      tried: entries.filter((d) => d.tried).length,
    };
  });
  const visitedCategories = new Set(
    menu.filter((d) => tried.has(d.id)).map((d) => d.categoryId),
  ).size;
  const achievements = [
    {
      id: "first",
      name: "Xin chào!",
      description: "Первый оплаченный и завершённый заказ",
      progress: orders.length,
      target: 1,
    },
    {
      id: "explorer",
      name: "Исследователь вкусов",
      description: "Попробуйте пять разных блюд",
      progress: tried.size,
      target: 5,
    },
    {
      id: "regular",
      name: "Как дома",
      description: "Пять оплаченных и завершённых заказов",
      progress: orders.length,
      target: 5,
    },
    {
      id: "variety",
      name: "Новые горизонты",
      description: "Попробуйте блюда из трёх категорий",
      progress: visitedCategories,
      target: 3,
    },
  ].map((a) => ({
    ...a,
    progress: Math.min(a.progress, a.target),
    earned: a.progress >= a.target,
  }));
  res.json({
    data: {
      preferences,
      recommendations: ranked,
      journey,
      achievements,
      generalAchievements: common,
      dishAchievements: dishAchievements(
        menu,
        orders.map((o) => o.data),
        await achievementRules(pool),
        awarded,
      ),
      completedOrders: orders.length,
    },
    error: null,
  });
});
discoveryRouter.put("/preferences", requireUser, async (req, res) => {
  const input = z
    .object({
      favorites: z.array(z.string().max(80)).max(100),
      maxSpice: z.number().int().min(0).max(3),
      avoidAllergens: z.array(z.string().trim().min(1).max(60)).max(30),
    })
    .parse(req.body);
  const menu = await dishes(pool);
  if (input.favorites.some((id) => !menu.some((d) => d.id === id)))
    fail(400, "DISH_NOT_FOUND", "Блюдо не найдено.");
  await pool.query(
    "INSERT INTO customer_preferences(user_id,favorites,max_spice,avoid_allergens) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET favorites=$2,max_spice=$3,avoid_allergens=$4",
    [
      req.session.user!.id,
      JSON.stringify([...new Set(input.favorites)]),
      input.maxSpice,
      JSON.stringify([...new Set(input.avoidAllergens)]),
    ],
  );
  res.json({ data: input, error: null });
});
discoveryRouter.get("/referrals", requireUser, async (req, res) => {
  const id = req.session.user!.id,
    settings = await v2Settings(pool);
  await pool.query(
    "INSERT INTO referral_codes(user_id,code) VALUES($1,$2) ON CONFLICT(user_id) DO NOTHING",
    [id, newCode().slice(0, 12)],
  );
  const code = (
    await pool.query("SELECT code FROM referral_codes WHERE user_id=$1", [id])
  ).rows[0].code;
  const counts = (
    await pool.query(
      "SELECT count(*)::int AS invited,count(rewarded_order_id)::int AS rewarded FROM referrals WHERE inviter_id=$1",
      [id],
    )
  ).rows[0];
  res.json({
    data: {
      code,
      ...counts,
      points: settings.referralPoints,
      enabled: settings.referralsEnabled,
      applied: !!(
        await pool.query(
          "SELECT invitee_id FROM referrals WHERE invitee_id=$1",
          [id],
        )
      ).rowCount,
    },
    error: null,
  });
});
discoveryRouter.post("/referrals/apply", requireUser, async (req, res) => {
  const code = z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-F0-9]{12}$/)
      .parse(req.body.code),
    id = req.session.user!.id;
  await transaction(async (db) => {
    await db.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [id]);
    if (!(await v2Settings(db)).referralsEnabled)
      fail(409, "REFERRALS_DISABLED", "Программа приглашений приостановлена.");
    const ref = (
      await db.query("SELECT user_id FROM referral_codes WHERE code=$1", [code])
    ).rows[0];
    if (!ref || ref.user_id === id)
      fail(400, "REFERRAL_CODE", "Код не найден или принадлежит вам.");
    if (
      (
        await db.query(
          "SELECT id FROM orders WHERE user_id=$1 AND status='COMPLETED'",
          [id],
        )
      ).rowCount
    )
      fail(
        409,
        "FIRST_ORDER_ONLY",
        "Код можно применить только до первого завершённого заказа.",
      );
    const existing = (
      await db.query("SELECT inviter_id FROM referrals WHERE invitee_id=$1", [
        id,
      ])
    ).rows[0];
    if (existing) {
      if (existing.inviter_id === ref.user_id) return;
      fail(409, "REFERRAL_EXISTS", "У вас уже есть приглашение.");
    }
    await db.query(
      "INSERT INTO referrals(invitee_id,inviter_id) VALUES($1,$2)",
      [id, ref.user_id],
    );
  });
  res.json({ data: { ok: true }, error: null });
});
