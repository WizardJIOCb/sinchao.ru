import { test } from "node:test";
import assert from "node:assert/strict";
import {
  menuFilterSearch,
  menuResultsPath,
  readMenuFilters,
} from "../shared/menu-search";

test("Shared search URLs round-trip Cyrillic, special characters and categories", () => {
  for (const query of ["Мык", "Фо Бо", "рис & чай + 50% #1?", ""]) {
    const filters = { query, category: "soups" };
    const url = new URL(menuResultsPath(filters), "https://food.xedoc.ru");
    assert.equal(url.pathname, "/menu");
    assert.deepEqual(readMenuFilters(url.search), filters);
  }
});

test("Clearing filters removes their parameters and sharing excludes unrelated state", () => {
  assert.equal(menuResultsPath({ query: "", category: "all" }), "/menu");
  assert.deepEqual(readMenuFilters(""), { query: "", category: "all" });
  assert.equal(
    menuFilterSearch(
      { query: "", category: "all" },
      "?q=old&category=soups&utm_source=qr",
    ),
    "?utm_source=qr",
  );
  const filters = readMenuFilters(
    "?q=tea&category=drinks&visit=private&token=private",
  );
  assert.equal(menuResultsPath(filters), "/menu?q=tea&category=drinks");
});
