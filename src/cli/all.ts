import { requireGeminiKey } from "../load-env.js";
import { getDb } from "../db/client.js";

requireGeminiKey();
import { fetchRss } from "../fetchers/rss.js";
import { fetchGoogleNews } from "../fetchers/google-news.js";
import { fetchSecFilings } from "../fetchers/sec.js";
import { scoreNewsItems } from "../scorer.js";
import { embedAndDedup } from "../dedup.js";
import { generateBriefing } from "../briefing.js";
import type { NewsSourceRow, RawNewsItem } from "../types.js";

const db = getDb();

// ─────────────────────────────────────────────────────────────────────────────
// 1. Ingest
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n[1/4] Ingest");
const sources = db
  .prepare(
    `SELECT * FROM news_sources WHERE enabled = 1 ORDER BY last_fetched_at ASC NULLS FIRST`
  )
  .all() as unknown as NewsSourceRow[];

const upsert = db.prepare(
  `INSERT OR IGNORE INTO news_items (id, source, source_url, title, content, authors, published_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);
const updateFetched = db.prepare(
  `UPDATE news_sources SET last_fetched_at = ? WHERE id = ?`
);

let ingested = 0;
for (const source of sources) {
  const config = JSON.parse(source.config);
  let items: RawNewsItem[] = [];
  try {
    switch (source.source_type) {
      case "google-news":
        items = await fetchGoogleNews(config.query);
        break;
      case "rss":
        items = await fetchRss(config.url, { filter: config.filter });
        break;
      case "sec":
        items = await fetchSecFilings(config.cik, config.ticker);
        break;
    }
  } catch (err) {
    console.error(`  ${source.name}: error`, err);
    continue;
  }
  let inserted = 0;
  for (const item of items) {
    const r = upsert.run(
      item.sourceId,
      item.source,
      item.sourceUrl,
      item.title,
      item.content,
      JSON.stringify(item.authors),
      item.publishedAt
    );
    if (r.changes > 0) inserted++;
  }
  updateFetched.run(new Date().toISOString(), source.id);
  console.log(`  ${source.name}: ${items.length} fetched, ${inserted} new`);
  ingested += inserted;
}
console.log(`  Total new items: ${ingested}`);

// ─────────────────────────────────────────────────────────────────────────────
// 2. Score (loop until no unscored items left, capped)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n[2/4] Score");
const BATCH = 15;
const MAX_BATCHES = 10;
let totalScored = 0;
for (let i = 0; i < MAX_BATCHES; i++) {
  const unscored = db
    .prepare(
      `SELECT id, title, content FROM news_items
       WHERE importance_score IS NULL
       ORDER BY published_at DESC
       LIMIT ?`
    )
    .all(BATCH) as Array<{ id: string; title: string; content: string | null }>;

  if (unscored.length === 0) break;

  const results = await scoreNewsItems(unscored);
  const update = db.prepare(
    `UPDATE news_items SET
       category = ?, subcategory = ?,
       importance_score = ?, importance_reason = ?,
       companies_mentioned = ?
     WHERE id = ?`
  );
  for (const r of results) {
    update.run(
      r.category,
      r.subcategory,
      r.importance_score,
      r.importance_reason,
      JSON.stringify(r.companies_mentioned),
      r.id
    );
    totalScored++;
  }
  console.log(`  Batch ${i + 1}: scored ${results.length}/${unscored.length}`);
  if (unscored.length < BATCH) break;
}
console.log(`  Total scored: ${totalScored}`);

// ─────────────────────────────────────────────────────────────────────────────
// 3. Dedup
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n[3/4] Embed + dedup");
let totalEmbedded = 0;
let totalClustered = 0;
for (let i = 0; i < MAX_BATCHES; i++) {
  const r = await embedAndDedup(30);
  totalEmbedded += r.embedded;
  totalClustered += r.clustered;
  if (r.embedded === 0 && r.clustered === 0) break;
  console.log(`  Pass ${i + 1}: embedded ${r.embedded}, clustered ${r.clustered}`);
}
console.log(`  Total: embedded ${totalEmbedded}, clustered ${totalClustered}`);

// ─────────────────────────────────────────────────────────────────────────────
// 4. Briefing
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n[4/4] Briefing");
const result = await generateBriefing();
if (!result) {
  console.log("  Nothing generated.");
} else {
  console.log(`  ${result.date} — ${result.newsItemIds.length} items included`);
  console.log(`  Wrote: ${result.path}`);
}

console.log("\nDone.");
