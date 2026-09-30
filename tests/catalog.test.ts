import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { menu, categories, contentSettings } from "../server/data/catalog";
import { dishSchema } from "../server/validation";
import { priceCart } from "../server/modules/pricing";
import { restaurant } from "./fixtures/demo-catalog";

const options = {
  fulfillment: "PICKUP" as const,
  zoneId: "",
  promo: "",
  points: 0,
};
const quote = (dishId: string, modifiers: string[]) =>
  priceCart(
    [{ id: "test", dishId, quantity: 1, modifiers, notes: "" }],
    menu,
    restaurant,
    options,
    0,
  );

test("Supplied VK menu has valid, unique items and local source photographs", () => {
  assert.equal(menu.length, 56);
  assert.equal(new Set(menu.map((d) => d.id)).size, menu.length);
  assert.equal(new Set(menu.map((d) => d.image)).size, 56);
  for (const dish of menu) {
    assert.ok(dishSchema.safeParse(dish).success, dish.id);
    assert.ok(
      categories.some((c) => c.id === dish.categoryId),
      dish.id,
    );
    assert.ok(existsSync("public" + dish.image), dish.image);
    assert.equal(dish.imageCrop, undefined, dish.id);
    assert.ok(dish.image.startsWith("/images/dishes/"), dish.id);
  }
  for (const path of [
    contentSettings.logoImage,
    contentSettings.contactImage,
    contentSettings.promoImage,
  ])
    assert.ok(existsSync("public" + path), path);
});

test("Real portions, garnishes and drinks price correctly; choices are mandatory", () => {
  assert.equal(quote("pho-bo", ["small"]).total, 35000);
  assert.equal(quote("pho-bo", ["large"]).total, 45000);
  assert.equal(quote("tom-yam", ["small", "rice"]).total, 40000);
  assert.equal(quote("tom-yam", ["large", "noodles"]).total, 55000);
  assert.equal(quote("coffee", ["two"]).total, 6000);
  assert.equal(quote("coffee", ["milk"]).total, 15000);
  assert.equal(quote("combo-pho-bo", []).total, 50000);
  assert.equal(quote("combo-tom-yam", []).total, 55000);
  assert.throws(() => quote("pho-bo", []), /Проверьте выбор/);
  assert.throws(() => quote("tom-yam", ["large"]), /Проверьте выбор/);
  assert.throws(() => quote("salad-mien", []), /Проверьте выбор/);
  assert.throws(() => quote("baltika", []), /больше не доступно/);
});
