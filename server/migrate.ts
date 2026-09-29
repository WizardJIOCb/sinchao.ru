import { readFile, readdir } from "node:fs/promises";
import { pool, transaction } from "./db";
export async function migrate() {
  await transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(912834)");
    await db.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())",
    );
    for (const name of (await readdir("server/migrations"))
      .filter((x) => x.endsWith(".sql"))
      .sort()) {
      if (
        !(
          await db.query("SELECT name FROM schema_migrations WHERE name=$1", [
            name,
          ])
        ).rowCount
      ) {
        await db.query(await readFile(`server/migrations/${name}`, "utf8"));
        await db.query("INSERT INTO schema_migrations(name) VALUES($1)", [
          name,
        ]);
        console.log("Applied", name);
      }
    }
  });
}
await migrate();
await pool.end();
