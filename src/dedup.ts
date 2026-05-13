import { getDb } from "./db/client.js";
import { embedText, cosineSimilarity } from "./embeddings.js";

const SIMILARITY_THRESHOLD = 0.92;
const DEDUP_WINDOW_DAYS = 7;

interface UnembeddedRow {
  id: string;
  title: string;
  content: string | null;
}

interface EmbeddedRow {
  id: string;
  embedding: string;
  dedup_cluster_id: string | null;
}

/**
 * Embed unembedded scored items, then deduplicate by cosine similarity
 * within a rolling 7-day window. Mirrors quantum-brain/lib/news/dedup.ts
 * but uses in-memory cosine since SQLite has no vector ops.
 */
export async function embedAndDedup(
  limit = 30
): Promise<{ embedded: number; clustered: number }> {
  const db = getDb();

  // Step 1: embed unembedded scored items.
  const unembedded = db
    .prepare(
      `SELECT id, title, content FROM news_items
       WHERE embedding IS NULL AND importance_score IS NOT NULL
       ORDER BY published_at DESC
       LIMIT ?`
    )
    .all(limit) as unknown as UnembeddedRow[];

  const updateEmbedding = db.prepare(
    `UPDATE news_items SET embedding = ? WHERE id = ?`
  );

  let embedded = 0;
  for (const item of unembedded) {
    try {
      const text = `${item.title}\n\n${(item.content ?? "").slice(0, 1000)}`;
      const vec = await embedText(text);
      updateEmbedding.run(JSON.stringify(vec), item.id);
      embedded++;
    } catch (err) {
      console.error(`[dedup] embed failed for ${item.id}:`, err);
    }
  }

  // Step 2: cluster unclustered items by cosine similarity.
  const cutoff = new Date(
    Date.now() - DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const unclustered = db
    .prepare(
      `SELECT id, embedding, dedup_cluster_id FROM news_items
       WHERE dedup_cluster_id IS NULL
         AND embedding IS NOT NULL
         AND published_at > ?
       ORDER BY published_at DESC
       LIMIT ?`
    )
    .all(cutoff, limit) as unknown as EmbeddedRow[];

  // Candidate pool: all items in the 7-day window with embeddings.
  const candidates = db
    .prepare(
      `SELECT id, embedding, dedup_cluster_id FROM news_items
       WHERE embedding IS NOT NULL AND published_at > ?`
    )
    .all(cutoff) as unknown as EmbeddedRow[];

  const setCluster = db.prepare(
    `UPDATE news_items SET dedup_cluster_id = ? WHERE id = ?`
  );

  let clustered = 0;
  for (const item of unclustered) {
    const itemVec = JSON.parse(item.embedding) as number[];

    let bestId: string | null = null;
    let bestClusterId: string | null = null;
    let bestSim = SIMILARITY_THRESHOLD;

    for (const cand of candidates) {
      if (cand.id === item.id) continue;
      const candVec = JSON.parse(cand.embedding) as number[];
      const sim = cosineSimilarity(itemVec, candVec);
      if (sim > bestSim) {
        bestSim = sim;
        bestId = cand.id;
        bestClusterId = cand.dedup_cluster_id;
      }
    }

    if (bestId && bestClusterId) {
      // Join existing cluster.
      setCluster.run(bestClusterId, item.id);
    } else if (bestId) {
      // Pair: form a new cluster keyed by this item's id.
      setCluster.run(item.id, item.id);
      setCluster.run(item.id, bestId);
    } else {
      // Singleton: cluster of one.
      setCluster.run(item.id, item.id);
    }
    clustered++;
  }

  return { embedded, clustered };
}
