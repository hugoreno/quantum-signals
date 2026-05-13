import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getDb } from "../db/client.js";

interface SourceJson {
  name: string;
  source_type: string;
  config: Record<string, unknown>;
}

const schemaPath = resolve(process.cwd(), "src", "db", "schema.sql");
const sourcesPath = resolve(process.cwd(), "sources.json");

console.log("[init-db] Applying schema…");
const db = getDb();
db.exec(readFileSync(schemaPath, "utf-8"));

console.log("[init-db] Seeding news_sources…");
const sources = JSON.parse(readFileSync(sourcesPath, "utf-8")) as SourceJson[];

const insert = db.prepare(
  `INSERT OR IGNORE INTO news_sources (name, source_type, config) VALUES (?, ?, ?)`
);

db.exec("BEGIN");
try {
  for (const s of sources) {
    insert.run(s.name, s.source_type, JSON.stringify(s.config));
  }
  db.exec("COMMIT");
} catch (err) {
  db.exec("ROLLBACK");
  throw err;
}

const row = db
  .prepare(`SELECT COUNT(*) AS count FROM news_sources`)
  .get() as { count: number };

console.log(`[init-db] Done. news_sources rows: ${row.count}.`);
