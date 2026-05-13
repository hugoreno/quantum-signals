import { XMLParser } from "fast-xml-parser";
import { createHash } from "node:crypto";
import type { RawNewsItem } from "../types.js";

interface RssItem {
  title?: string;
  description?: string;
  "content:encoded"?: string;
  link?: string;
  pubDate?: string;
  published?: string;
  updated?: string;
  author?: string | { name?: string };
  "dc:creator"?: string;
}

interface AtomEntry {
  title?: string | { "#text"?: string };
  summary?: string;
  content?: string | { "#text"?: string };
  link?: string | { "@_href"?: string } | Array<{ "@_href"?: string }>;
  published?: string;
  updated?: string;
  author?: { name?: string } | Array<{ name?: string }>;
}

function makeId(url: string, title: string): string {
  const hash = createHash("sha256")
    .update(`${url}|${title}`)
    .digest("hex")
    .slice(0, 16);
  return `rss:${hash}`;
}

function extractText(val: unknown): string {
  if (typeof val === "string") return val;
  if (val && typeof val === "object" && "#text" in val)
    return String((val as Record<string, unknown>)["#text"] ?? "");
  return "";
}

function extractLink(link: unknown): string {
  if (typeof link === "string") return link;
  if (Array.isArray(link)) {
    const first = link[0];
    if (first && typeof first === "object" && "@_href" in first)
      return String(first["@_href"]);
  }
  if (link && typeof link === "object" && "@_href" in link)
    return String((link as Record<string, unknown>)["@_href"]);
  return "";
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

export async function fetchRss(
  url: string,
  options?: { filter?: string }
): Promise<RawNewsItem[]> {
  const response = await fetch(url, {
    headers: { "User-Agent": "ManyWorldsCapital/1.0 QuantumSignals" },
  });
  if (!response.ok) {
    console.error(`RSS fetch failed for ${url}: ${response.status}`);
    return [];
  }

  const xml = await response.text();
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });
  const parsed = parser.parse(xml);

  let items: RawNewsItem[] = [];

  if (parsed.rss?.channel?.item) {
    const rssItems: RssItem[] = Array.isArray(parsed.rss.channel.item)
      ? parsed.rss.channel.item
      : [parsed.rss.channel.item];

    items = rssItems.map((item) => {
      const title = String(item.title ?? "").trim();
      const content = stripHtml(
        String(item["content:encoded"] ?? item.description ?? "")
      );
      const sourceUrl = String(item.link ?? "");
      const author =
        typeof item.author === "string"
          ? item.author
          : typeof item["dc:creator"] === "string"
            ? item["dc:creator"]
            : "";

      return {
        sourceId: makeId(sourceUrl, title),
        source: "rss" as const,
        sourceUrl,
        title,
        content,
        authors: author ? [author] : [],
        publishedAt:
          item.pubDate ?? item.published ?? new Date().toISOString(),
      };
    });
  }

  if (parsed.feed?.entry) {
    const atomEntries: AtomEntry[] = Array.isArray(parsed.feed.entry)
      ? parsed.feed.entry
      : [parsed.feed.entry];

    items = atomEntries.map((entry) => {
      const title = extractText(entry.title).trim();
      const content = stripHtml(
        extractText(entry.content) || extractText(entry.summary)
      );
      const sourceUrl = extractLink(entry.link);
      const authorArr = Array.isArray(entry.author)
        ? entry.author
        : entry.author
          ? [entry.author]
          : [];
      const authors = authorArr
        .map((a) => a.name ?? "")
        .filter(Boolean);

      return {
        sourceId: makeId(sourceUrl, title),
        source: "rss" as const,
        sourceUrl,
        title,
        content,
        authors,
        publishedAt:
          entry.published ?? entry.updated ?? new Date().toISOString(),
      };
    });
  }

  if (options?.filter) {
    const keyword = options.filter.toLowerCase();
    items = items.filter(
      (item) =>
        item.title.toLowerCase().includes(keyword) ||
        item.content.toLowerCase().includes(keyword)
    );
  }

  return items;
}
