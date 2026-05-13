import { XMLParser } from "fast-xml-parser";
import { createHash } from "node:crypto";
import type { RawNewsItem } from "../types.js";

const SEC_RSS_BASE = "https://www.sec.gov/cgi-bin/browse-edgar";

export async function fetchSecFilings(
  cik: string,
  ticker: string
): Promise<RawNewsItem[]> {
  const url = `${SEC_RSS_BASE}?action=getcompany&CIK=${cik}&type=8-K&dateb=&owner=include&count=10&search_text=&action=getcompany&output=atom`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "ManyWorldsCapital team@manyworldscapital.com",
    },
  });

  if (!response.ok) {
    console.error(`SEC EDGAR fetch failed for ${ticker}: ${response.status}`);
    return [];
  }

  const xml = await response.text();
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });
  const parsed = parser.parse(xml);

  if (!parsed.feed?.entry) return [];

  const entries = Array.isArray(parsed.feed.entry)
    ? parsed.feed.entry
    : [parsed.feed.entry];

  return entries.map((entry: Record<string, unknown>) => {
    const title = `[${ticker}] ${String(entry.title ?? "SEC Filing")}`;
    const summary = String(entry.summary ?? "");
    const link = Array.isArray(entry.link)
      ? String((entry.link[0] as Record<string, unknown>)?.["@_href"] ?? "")
      : typeof entry.link === "object" && entry.link !== null
        ? String((entry.link as Record<string, unknown>)["@_href"] ?? "")
        : "";
    const updated = String(entry.updated ?? new Date().toISOString());

    const hash = createHash("sha256")
      .update(`${link}|${title}`)
      .digest("hex")
      .slice(0, 16);

    return {
      sourceId: `sec:${hash}`,
      source: "sec" as const,
      sourceUrl: link,
      title,
      content: summary.replace(/<[^>]*>/g, "").trim(),
      authors: [ticker],
      publishedAt: updated,
    };
  });
}
