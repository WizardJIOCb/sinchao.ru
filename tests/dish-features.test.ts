import { test } from "node:test";
import assert from "node:assert/strict";
import { dishFeatures } from "../shared/dish-features";
import { dishSchema } from "../server/validation";
import { menu } from "../server/data/catalog";

test("legacy feature suggestions use positive ingredient evidence, not absence of meat", () => {
  const d = {
    ingredients: ["Креветки", "Кальмары", "Шампиньоны"],
    allergens: [],
    tags: [],
  };
  assert.deepEqual(dishFeatures(d), ["seafood", "mushrooms"]);
  assert.deepEqual(
    dishFeatures({ ...d, ingredients: ["Рис", "Овощи", "Кокосовое молоко"] }),
    [],
  );
  assert.deepEqual(dishFeatures({ ...d, ingredients: ["Куриный бульон"] }), [
    "chicken",
  ]);
  assert.deepEqual(
    dishFeatures({ ...d, ingredients: ["Рис"], tags: ["Веганское"] }),
    ["vegan"],
  );
});
test("explicit feature choices and clearing override inferred ingredients", () => {
  const d = { ingredients: ["Говядина"], allergens: [], tags: [] };
  assert.deepEqual(dishFeatures(d), ["beef"]);
  assert.deepEqual(dishFeatures({ ...d, features: [] }), []);
  assert.deepEqual(dishFeatures({ ...d, features: ["chicken"] }), ["chicken"]);
  assert.deepEqual(
    dishSchema.parse({ ...menu[0], features: ["seafood", "mushrooms"] })
      .features,
    ["seafood", "mushrooms"],
  );
  assert.equal(
    dishSchema.safeParse({ ...menu[0], features: ["not-a-feature"] }).success,
    false,
  );
  assert.equal(
    dishSchema.safeParse({ ...menu[0], features: ["beef", "beef"] }).success,
    false,
  );
});
