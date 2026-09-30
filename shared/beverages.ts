import type { Dish } from "./types";

export function isBeverage(dish: Dish): boolean {
  return (
    /drink|napit|beverage|beer|alcohol/i.test(dish.categoryId) ||
    dish.id === "baltika" ||
    /пиво|пивной/i.test(dish.name)
  );
}
