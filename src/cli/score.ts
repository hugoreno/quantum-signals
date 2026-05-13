import { requireGeminiKey } from "../load-env.js";
import { getDb } from "../db/client.js";
import { scoreNewsItems } from "../scorer.js";

requireGeminiKey();

const BATCH_SIZE = 15;

const db = getDb();

const unscored = db
  .prepare(
    `SELECT id, title, content FROM news_items
     WHERE importance_score IS NULL
     ORDER BY published_at DESC
     LIMIT ?`
  )
  .all(BATCH_SIZE) as Array<{ id: string; title: string; content: string | null }>;

if (unscored.length === 0) {
  console.log("[score] No unscored items.");
  process.exit(0);
}

console.log(`[score] Scoring ${unscored.length} items via Gemini 2.5 Flash…`);
const results = await scoreNewsItems(unscored);

const update = db.prepare(
  `UPDATE news_items SET
     category = ?,
     subcategory = ?,
     importance_score = ?,
     importance_reason = ?,
     companies_mentioned = ?
   WHERE id = ?`
);

let scored = 0;
for (const r of results) {
  update.run(
    r.category,
    r.subcategory,
    r.importance_score,
    r.importance_reason,
    JSON.stringify(r.companies_mentioned),
    r.id
  );
  scored++;
}

console.log(`[score] Done. Scored ${scored}/${unscored.length} items.`);
