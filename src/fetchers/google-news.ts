import { fetchRss } from "./rss.js";
import type { RawNewsItem } from "../types.js";

const GOOGLE_NEWS_RSS_BASE =
  "https://news.google.com/rss/search?hl=en-US&gl=US&ceid=US:en&q=";

export async function fetchGoogleNews(
  query: string
): Promise<RawNewsItem[]> {
  const url = `${GOOGLE_NEWS_RSS_BASE}${encodeURIComponent(query)}`;
  const items = await fetchRss(url);

  return items.map((item) => ({
    ...item,
    source: "google-news" as const,
    sourceId: item.sourceId.replace("rss:", "gnews:"),
  }));
}
