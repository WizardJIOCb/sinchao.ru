import type {
  GeneralAchievement,
  GeneralAchievementRule,
} from "../shared/marketing";
export const generalDefaults = [
  {
    id: "bills",
    name: "Счётный магнат",
    icon: "🧾",
    description:
      "Закрытые оплаченные счета с вашими заказами. Один визит за столом — один счёт.",
    milestones: [1, 5, 10, 25, 50],
  },
  {
    id: "tips",
    name: "Чай-палпатин",
    icon: "🫖",
    description:
      "Чаевые от вас в оплаченных завершённых заказах и закрытых счетах за столом.",
    milestones: [1, 3, 5, 10, 20],
  },
  {
    id: "delivery",
    name: "Диванный гурман",
    icon: "🛵",
    description:
      "Оплаченные завершённые заказы с доставкой. Вкусное само пришло домой.",
    milestones: [1, 3, 5, 10, 20],
  },
  {
    id: "pickup",
    name: "Самовывозвышение",
    icon: "🥡",
    description: "Оплаченные завершённые заказы навынос. Пришёл, увидел, унёс.",
    milestones: [1, 3, 5, 10, 20],
  },
];
const ranks = ["Первый шаг", "Вошёл во вкус", "На опыте", "Мастер", "Легенда"];
export function generalAchievements(
  counts: Record<string, number>,
  rules: GeneralAchievementRule[] = [],
): GeneralAchievement[] {
  return generalDefaults.flatMap((d) => {
    const rule = rules.find((r) => r.id === d.id);
    if (rule?.enabled === false) return [];
    const milestones = rule?.milestones ?? d.milestones,
      progress = counts[d.id] ?? 0;
    const level = milestones.filter((n) => progress >= n).length;
    return [
      {
        ...d,
        image: rule?.image ?? null,
        name: rule?.name ?? d.name,
        milestones,
        progress,
        level,
        rank: level ? ranks[level - 1] : "Всё впереди",
        nextTarget: milestones[level] ?? null,
      },
    ];
  });
}
