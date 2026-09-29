import { app } from "./app";
import { pool } from "./db";
const server = app.listen(
  Number(process.env.PORT ?? 3187),
  process.env.HOST ?? "127.0.0.1",
  () => console.log("Restaurant service listening"),
);
const maintenance = setInterval(() => {
  pool
    .query("DELETE FROM sessions WHERE expires_at<now()")
    .catch(console.error);
  pool
    .query("DELETE FROM analytics WHERE created_at<now()-interval '90 days'")
    .catch(console.error);
}, 3600000);
maintenance.unref();
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    clearInterval(maintenance);
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
