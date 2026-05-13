import "../load-env.js";
// ingest doesn't need Gemini, only fetches RSS / SEC.
import { getDb } from "../db/client.js";
import { fetchRss } from "../fetchers/rss.js";
import { fetchGoogleNews } from "../fetchers/google-news.js";
import { fetchSecFilings } from "../fetchers/sec.js";
import type { NewsSourceRow, RawNewsItem } from "../types.js";

const db = getDb();

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

let totalUpserted = 0;
let totalSources = 0;

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
      default:
        console.warn(`[ingest] Unknown source_type: ${source.source_type}`);
        continue;
    }
  } catch (err) {
    console.error(`[ingest] Error fetching ${source.name}:`, err);
    continue;
  }

  let upserted = 0;
  for (const item of items) {
    const result = upsert.run(
      item.sourceId,
      item.source,
      item.sourceUrl,
      item.title,
      item.content,
      JSON.stringify(item.authors),
      item.publishedAt
    );
    if (result.changes > 0) upserted++;
  }

  updateFetched.run(new Date().toISOString(), source.id);
  totalUpserted += upserted;
  totalSources++;
  console.log(
    `[ingest] ${source.name}: fetched ${items.length}, inserted ${upserted} new`
  );
}

console.log(
  `[ingest] Done. ${totalSources} sources processed, ${totalUpserted} new items.`
);
