import type { Dish } from "./types";
export const dishFeatureIds = [
  "vegetarian",
  "vegan",
  "chicken",
  "beef",
  "pork",
  "fish",
  "seafood",
  "mushrooms",
  "egg",
  "milk",
  "nuts",
] as const;
export type DishFeature = (typeof dishFeatureIds)[number];
export const dishFeatureLabels: Record<DishFeature, string> = {
  vegetarian: "Вегетарианское",
  vegan: "Веганское",
  chicken: "Курица",
  beef: "Говядина",
  pork: "Свинина",
  fish: "Рыба",
  seafood: "Морепродукты",
  mushrooms: "Грибы",
  egg: "Яйца",
  milk: "Молочные продукты",
  nuts: "Орехи",
};
/** Explicit choices (including an empty array) override legacy catalogue suggestions. */
export function dishFeatures(
  dish: Pick<Dish, "features" | "ingredients" | "allergens" | "tags">,
): DishFeature[] {
  if (dish.features !== undefined) return [...new Set(dish.features)];
  const ingredients = dish.ingredients.join(" ").toLowerCase();
  const allergens = dish.allergens.join(" ").toLowerCase();
  const tags = dish.tags.join(" ").toLowerCase();
  const result: DishFeature[] = [];
  if (/веган/.test(tags)) result.push("vegan");
  else if (/вегетариан/.test(tags)) result.push("vegetarian");
  const matches: [DishFeature, RegExp][] = [
    ["chicken", /куриц|курин|цыпл/],
    ["beef", /говядин|говяж|телят/],
    ["pork", /свинин|свиног|свиной|бекон|ветчин/],
    ["fish", /рыб|лосос|форел|тунец/],
    ["seafood", /кревет|кальмар|миди|морепродукт|осьминог|краб/],
    ["mushrooms", /гриб|шампиньон|шиитаке/],
    ["egg", /яйц|яич/],
    ["nuts", /арахис|кешью|миндал|фундук|грецк/],
  ];
  for (const [id, pattern] of matches)
    if (pattern.test(ingredients)) result.push(id);
  if (/молок|молоч|лактоз/.test(allergens)) result.push("milk");
  return result;
}
