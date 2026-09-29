import { pool } from "../server/db";
const [email, role] = process.argv.slice(2);
if (!email || !["ADMIN", "MANAGER", "STAFF", "CUSTOMER"].includes(role)) {
  console.error(
    "Usage: tsx scripts/set-role.ts registered@email ADMIN|MANAGER|STAFF|CUSTOMER",
  );
  process.exit(1);
}
const r = await pool.query(
  "UPDATE users SET role=$1 WHERE email=$2 RETURNING email,role",
  [role, email.toLowerCase()],
);
if (!r.rowCount) {
  console.error("No registered account with this email.");
  process.exitCode = 1;
} else console.log(r.rows[0]);
await pool.end();
