import { randomUUID } from "node:crypto";
import type { DB } from "./db";
import { categories, menu, contentSettings } from "./data/catalog";

// Versioned, atomic content import. Subsequent deploys preserve staff edits.
export async function importCatalog(db: DB) {
  const version = "vk-menu-2026-09-29";
  await db.query("SELECT pg_advisory_xact_lock(912835)");
  if (
    (await db.query("SELECT id FROM catalog_imports WHERE id=$1", [version]))
      .rowCount
  )
    return false;
  const before = {
    dishes: (
      await db.query("SELECT data FROM dishes ORDER BY position")
    ).rows.map((r) => r.data),
    categories: (
      await db.query("SELECT data FROM categories ORDER BY position")
    ).rows.map((r) => r.data),
    config: (await db.query("SELECT data FROM restaurant WHERE id=1")).rows[0]
      ?.data,
  };
  // Order history stores its own dish/price snapshots and is untouched.
  await db.query("DELETE FROM dishes");
  await db.query("DELETE FROM categories");
  for (const [position, value] of categories.entries())
    await db.query(
      "INSERT INTO categories(id,data,position) VALUES($1,$2,$3)",
      [value.id, JSON.stringify(value), position],
    );
  for (const [position, value] of menu.entries())
    await db.query("INSERT INTO dishes(id,data,position) VALUES($1,$2,$3)", [
      value.id,
      JSON.stringify(value),
      position,
    ]);
  await db.query("UPDATE restaurant SET data=data || $1::jsonb WHERE id=1", [
    JSON.stringify(contentSettings),
  ]);
  await db.query(
    "INSERT INTO audit_logs(id,action,entity_id,before_data,after_data) VALUES($1,$2,$3,$4,$5)",
    [
      randomUUID(),
      "CATALOG_IMPORTED",
      version,
      JSON.stringify(before),
      JSON.stringify({ dishes: menu, categories, contentSettings }),
    ],
  );
  await db.query("INSERT INTO catalog_imports(id) VALUES($1)", [version]);
  return true;
}
