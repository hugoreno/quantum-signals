export interface RawNewsItem {
  sourceId: string;
  source: "google-news" | "rss" | "sec";
  sourceUrl: string;
  title: string;
  content: string;
  authors: string[];
  publishedAt: string;
}

export interface NewsSourceRow {
  id: number;
  name: string;
  source_type: string;
  config: string;
  enabled: number;
  last_fetched_at: string | null;
  fetch_interval_minutes: number;
}

export interface BriefingNewsItem {
  id: string;
  title: string;
  content: string | null;
  source: string;
  source_url: string | null;
  category: string | null;
  importance_score: number;
  importance_reason: string | null;
  companies_mentioned: string | null;
  published_at: string;
}
