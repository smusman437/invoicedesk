import { buildApp } from "./app.js";
import { openDatabase } from "./db.js";

const db = openDatabase();
const app = buildApp(db, { logger: true });

try {
  await app.listen({ port: 3001, host: "0.0.0.0" });
  console.log("InvoiceDesk API listening on http://localhost:3001");
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
