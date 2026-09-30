import {
  Beef,
  Drumstick,
  Egg,
  Fish,
  Flame,
  Ham,
  Leaf,
  Milk,
  Nut,
  Shell,
  Sprout,
} from "lucide-react";
import type { Dish } from "../shared/types";
import {
  dishFeatures,
  dishFeatureLabels,
  type DishFeature,
} from "../shared/dish-features";
import "./dish-features.css";

function Mushroom({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 13a9 9 0 0 1 18 0H3Zm7 0-1 8h6l-1-8" />
      <path d="M8 8h.01M15 9h.01M12 5h.01" />
    </svg>
  );
}
const icons = {
  vegetarian: Leaf,
  vegan: Sprout,
  chicken: Drumstick,
  beef: Beef,
  pork: Ham,
  fish: Fish,
  seafood: Shell,
  mushrooms: Mushroom,
  egg: Egg,
  milk: Milk,
  nuts: Nut,
};
export function DishFeatureIcon({ id }: { id: DishFeature | "spicy" }) {
  const Icon = id === "spicy" ? Flame : icons[id];
  return <Icon size={16} aria-hidden={true} />;
}
export function DishFeatures({ dish }: { dish: Dish }) {
  const selected = dishFeatures(dish);
  if (!selected.length && !dish.spice) return null;
  return (
    <ul className="dish-features" aria-label="Особенности блюда">
      {dish.spice > 0 && (
        <li
          className="feature-spicy"
          title={["", "Слегка острое", "Острое", "Очень острое"][dish.spice]}
        >
          <DishFeatureIcon id="spicy" />
          <span>
            {["", "Слегка острое", "Острое", "Очень острое"][dish.spice]}
          </span>
        </li>
      )}
      {selected.map((id) => (
        <li className={`feature-${id}`} key={id} title={dishFeatureLabels[id]}>
          <DishFeatureIcon id={id} />
          <span>{dishFeatureLabels[id]}</span>
        </li>
      ))}
    </ul>
  );
}
