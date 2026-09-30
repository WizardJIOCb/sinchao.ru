import type { Dish } from "../shared/types";
import type { DishAchievement } from "../shared/v2";
import type { AchievementRule } from "../shared/marketing";
import { isBeverage } from "../shared/beverages";

export const dishMilestones = [1, 3, 5, 10, 20];
const ranks = [
  "Первое знакомство",
  "Любимый вкус",
  "Знаток",
  "Мастер",
  "Легенда",
];
const names: Record<string, string> = {
  "pho-bo": "Фо-рсаж",
  "pho-ga": "Фо-кусь",
  "tom-yam": "Том-ям и снова",
  "lau-hai-san": "Лау, как вкусно!",
  "lau-assorti": "Лау — и всё сразу",
  "bun-ca": "Бун аппетит!",
  "thit-sao-nam": "Грибной роман",
  "ga-sao-nam": "Га-строном",
  "hai-san-sao-nam": "Море по грибы",
  "thit-chua-ngot": "Кисло-сладкая жизнь",
  "ga-chua-ngot": "Га-рмония вкуса",
  "myk-sao-chua-ngot": "Кальмар настроения",
  "bo-steak": "Бо-бедитель",
  "canh-ga": "Крылья вкуса",
  "tom-sao-dua": "Том и ананас",
  "myk-sao-dua": "Тропический кальмар",
  "mi-sao-bo": "Ми-стер Бо",
  "mi-sao-ga": "Ми-ми-ми",
  "mi-sao-hai-san": "Ми-р морепродуктов",
  "mien-sao-bo": "Миен — и точка",
  "mien-sao-ga": "Миен любимый",
  "pho-sao-ga": "Фо-кус с лапшой",
  "pho-sao-bo": "Фо-рмула вкуса",
  "com-trung": "Ком-плимент повару",
  "com-ga": "Ком-фортная еда",
  "com-ca": "Ком-пас на рыбу",
  "com-chien-ga": "Ком-анда хруста",
  "com-chien-bo": "Ком-бо с характером",
  "com-chien-hai-san": "Ком-пас на море",
  "com-tron": "Ком-позиция вкуса",
  "nem-hanoi": "Нэм-ножко ещё",
  "nem-hai-san": "Нэм-оре вкуса",
  "nem-cuon": "Нэм-едленно заверните",
  "myk-chien-su": "Хрусть — и кальмар",
  "tom-chien-su": "Креветка в доспехах",
  "khoai-tau-chien": "Картофельный дзен",
  "salad-soai-tom": "Манго-мания",
  "salad-ga": "Га-лерея свежести",
  "salad-mien": "Миен свежий взгляд",
  "salad-myk": "Кальмарный интерес",
  "salad-bo": "Бо-таник вкуса",
  "combo-pho-bo": "Фо-лный комплект",
  "combo-lau": "Лау-комплект",
  "combo-tom-yam": "Том-ям по полной",
  "milk-tea": "Бабл и точка",
  "juice-pearls": "Жемчужина компании",
  water: "Водный дзен",
  "fruit-tea": "Чайный фрукт",
  coffee: "Кофе-режим включён",
  "tea-pot": "Чайник со стажем",
  "soda-can": "Пшик — и шик",
  "fruit-juice": "Сочный персонаж",
  "fruit-juice-cup": "Сокровище в стакане",
  "soda-bottle": "Газированная личность",
  burn: "Бёрнный характер",
  baltika: "Пенный философ",
};

// Count a dish once per order, regardless of portions or modifier variants.
// Callers pass only this customer's paid, completed orders.
export function dishAchievements(
  menu: Dish[],
  orders: { items: { dishId: string }[] }[],
  rules: AchievementRule[] = [],
  awarded: Record<string, number> = {},
): DishAchievement[] {
  const counts = new Map<string, number>();
  for (const order of orders)
    for (const id of new Set(order.items.map((item) => item.dishId)))
      counts.set(id, (counts.get(id) ?? 0) + 1);
  return menu
    .filter(
      (d) =>
        (d.orderable !== false || isBeverage(d)) &&
        rules.find((r) => r.dishId === d.id)?.enabled !== false,
    )
    .map((dish) => {
      const rule = rules.find((r) => r.dishId === dish.id);
      const milestones = rule?.milestones ?? dishMilestones;
      const awardedProgress = awarded[dish.id] ?? 0;
      const orders = (counts.get(dish.id) ?? 0) + awardedProgress;
      const level = milestones.filter((target) => orders >= target).length;
      return {
        dish,
        name:
          rule?.name ??
          names[dish.id] ??
          `${isBeverage(dish) ? "Глоток настроения" : "На своей волне"}: ${dish.name}`,
        orders,
        awardedProgress,
        level,
        rank: level ? ranks[level - 1] : "Ещё впереди",
        nextTarget: milestones[level] ?? null,
        milestones,
      };
    })
    .sort((a, b) => b.level - a.level || b.orders - a.orders);
}
