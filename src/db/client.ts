import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DB_PATH = resolve(process.cwd(), "data", "qs.sqlite");

let dbInstance: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!dbInstance) {
    mkdirSync(dirname(DB_PATH), { recursive: true });
    dbInstance = new DatabaseSync(DB_PATH);
    dbInstance.exec("PRAGMA journal_mode = WAL");
    dbInstance.exec("PRAGMA foreign_keys = ON");
  }
  return dbInstance;
}

export { DB_PATH };
