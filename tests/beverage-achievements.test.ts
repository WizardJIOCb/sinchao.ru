import { test } from "node:test";
import assert from "node:assert/strict";
import { menu } from "../server/data/catalog";
import { dishAchievements } from "../server/dish-achievements";
import { isBeverage } from "../shared/beverages";

test("all twelve catalogue drinks have distinct managed achievements, including restaurant-only beer", () => {
  const entries = dishAchievements(menu, []).filter((a) => isBeverage(a.dish));
  assert.equal(entries.length, 12);
  assert.equal(new Set(entries.map((a) => a.name)).size, 12);
  assert.equal(entries.find((a) => a.dish.id === "water")?.name, "Водный дзен");
  assert.equal(
    entries.find((a) => a.dish.id === "baltika")?.dish.orderable,
    false,
  );
  assert.ok(entries.every((a) => a.level === 0 && a.nextTarget === 1));
  assert.equal(
    dishAchievements(menu, []).filter((a) => !isBeverage(a.dish)).length,
    44,
  );
});

test("drink history counts once per order and uses editable names, thresholds and visibility", () => {
  const orders = Array.from({ length: 5 }, () => ({
    items: [{ dishId: "water" }, { dishId: "water" }, { dishId: "tea-pot" }],
  }));
  const entries = dishAchievements(menu, orders);
  const water = entries.find((a) => a.dish.id === "water")!;
  assert.equal(water.orders, 5);
  assert.equal(water.level, 3);
  assert.equal(water.nextTarget, 10);
  assert.equal(entries.find((a) => a.dish.id === "fruit-juice")?.orders, 0);
  const rule = {
    dishId: "water",
    name: "Аква-мастер",
    enabled: true,
    milestones: [2, 4, 6, 8, 10],
  };
  const edited = dishAchievements(menu, orders, [rule]).find(
    (a) => a.dish.id === "water",
  )!;
  assert.equal(edited.name, rule.name);
  assert.equal(edited.level, 2);
  assert.equal(edited.nextTarget, 6);
  assert.ok(
    !dishAchievements(menu, orders, [{ ...rule, enabled: false }]).some(
      (a) => a.dish.id === "water",
    ),
  );
});
