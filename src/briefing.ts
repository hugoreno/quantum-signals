import { GoogleGenAI } from "@google/genai";
import { getDb } from "./db/client.js";
import type { BriefingNewsItem } from "./types.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const MODEL = "gemini-2.5-flash";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  }
  return client;
}

const COMPANY_DIRECTORY: Record<string, string> = {
  "Google Quantum AI": "https://quantumai.google",
  "IBM Quantum": "https://www.ibm.com/quantum",
  "IonQ": "https://ionq.com",
  "Rigetti": "https://www.rigetti.com",
  "D-Wave": "https://www.dwavequantum.com",
  "Pasqal": "https://www.pasqal.com",
  "PsiQuantum": "https://www.psiquantum.com",
  "Quantinuum": "https://www.quantinuum.com",
  "QuEra": "https://www.quera.com",
  "Atom Computing": "https://www.atom-computing.com",
  "Alice & Bob": "https://alice-bob.com",
  "Xanadu": "https://www.xanadu.ai",
  "Infleqtion": "https://www.infleqtion.com",
  "Classiq": "https://www.classiq.io",
  "QC Ware": "https://www.qcware.com",
  "Multiverse Computing": "https://multiversecomputing.com",
  "IQM": "https://www.meetiqm.com",
  "Terra Quantum": "https://terraquantum.swiss",
  "Riverlane": "https://www.riverlane.com",
  "Horizon Quantum": "https://www.horizonquantum.com",
  "QNu Labs": "https://www.qnulabs.com",
  "Quantonation": "https://www.quantonation.com",
  "Zapata AI": "https://www.zapata.ai",
  "Intel Quantum": "https://www.intel.com/content/www/us/en/research/quantum-computing.html",
  "Microsoft Quantum": "https://quantum.microsoft.com",
  "Amazon Braket": "https://aws.amazon.com/braket",
};

const COMPANY_DIRECTORY_TEXT = Object.entries(COMPANY_DIRECTORY)
  .map(([name, url]) => `${name}: ${url}`)
  .join("\n");

const BRIEFING_SYSTEM_PROMPT = `You are writing the twice-weekly (Monday & Thursday) Quantum Signals briefing for the managing partners of Many Worlds Capital, a quantum computing VC fund.

This briefing is a STARTING POINT for their exploration of quantum news. Every item should give readers enough context to understand why it matters, and a direct link to read more.

CRITICAL FORMATTING RULES:
- Every news item MUST include a markdown link to its source article: [Read more](url) or [Source title](url)
- When mentioning a company, link to their website on first mention using the company directory below
- Use markdown links throughout — this will be rendered as HTML in email

## The Signal
The single most important development since the last briefing. 2-3 paragraphs analyzing what happened and why it matters for quantum investors. Include the source link. Be specific about valuation implications, competitive dynamics, or technical significance. If nothing truly significant happened, say so honestly.

## Scientific Developments
Bullet points of notable research. Each bullet: what happened, who did it, why it matters, and a [Read more](source_url) link. Max 5 items. Skip this section if there are no scientific items.

## Market & Financial
Bullet points of funding, M&A, public market moves, partnerships. Each with context and a source link. Skip this section if there are no financial items.

## On Our Radar
2-3 items that aren't headline news but could become important. Early signals, emerging trends, or things to watch. This section is REQUIRED — always include it, even on quiet days. Frame these as "keep an eye on this because..."

## Quick Links
A flat numbered list of ALL source articles referenced in this briefing. Format: [Article title](url). This gives readers a scannable list to open in tabs for deeper reading.

COMPANY DIRECTORY (use these URLs when linking company names):
${COMPANY_DIRECTORY_TEXT}

Tone: Direct, analytical, no hype. Think morning briefing that kicks off the day's research — not a final report.
Keep it scannable — busy investors should get the key points in under 3 minutes, then click through for depth.`;

export async function generateBriefing(): Promise<{
  content: string;
  newsItemIds: string[];
  date: string;
  path: string;
} | null> {
  const db = getDb();
  const now = new Date();
  const today = now.toISOString().split("T")[0];

  // Lookback window: Monday covers Fri–Mon (96h), other days 72h.
  const dow = now.getUTCDay();
  const lookbackHours = dow === 1 ? 96 : 72;
  const cutoff = new Date(
    now.getTime() - lookbackHours * 60 * 60 * 1000
  ).toISOString();

  // Idempotency: skip if today's briefing is already generated.
  const existing = db
    .prepare(`SELECT id, content FROM briefings WHERE briefing_date = ?`)
    .get(today) as { id: number; content: string } | undefined;

  if (existing) {
    const path = writeBriefingFile(today, existing.content);
    console.log(`[briefing] Already generated for ${today} (id=${existing.id}). Re-wrote ${path}.`);
    return { content: existing.content, newsItemIds: [], date: today, path };
  }

  // Top items in window, deduped: pick best per cluster.
  const items = db
    .prepare(
      `WITH ranked AS (
         SELECT *,
           ROW_NUMBER() OVER (
             PARTITION BY COALESCE(dedup_cluster_id, id)
             ORDER BY importance_score DESC, LENGTH(COALESCE(content, '')) DESC
           ) AS rn
         FROM news_items
         WHERE importance_score IS NOT NULL
           AND importance_score >= 4
           AND published_at > ?
           AND COALESCE(briefing_included, 0) = 0
           AND COALESCE(dedup_cluster_id, id) NOT IN (
             SELECT DISTINCT COALESCE(dedup_cluster_id, id)
             FROM news_items
             WHERE briefing_included = 1
           )
       )
       SELECT id, title, content, source, source_url, category,
              importance_score, importance_reason, companies_mentioned, published_at
       FROM ranked
       WHERE rn = 1
       ORDER BY importance_score DESC
       LIMIT 50`
    )
    .all(cutoff) as unknown as BriefingNewsItem[];

  if (items.length === 0) {
    const quietContent = `# Many Worlds — Quantum Signals — ${today}\n\n## The Signal\n\nQuiet stretch in the quantum world. No major developments since the last briefing.\n\n---\n*Generated by Many Worlds Capital Quantum Brain*`;

    db.prepare(
      `INSERT INTO briefings (briefing_date, content, news_item_ids) VALUES (?, ?, '[]')`
    ).run(today, quietContent);

    const path = writeBriefingFile(today, quietContent);
    return { content: quietContent, newsItemIds: [], date: today, path };
  }

  // URL first so Gemini reliably keeps the link.
  const itemDescriptions = items
    .map(
      (item, i) =>
        `[${i + 1}] URL: ${item.source_url ?? "no link"}\nScore: ${item.importance_score}/10 | ${item.category ?? "uncategorized"} | Source: ${item.source}\nTitle: ${item.title}\nContent: ${(item.content ?? "").slice(0, 400)}\nCompanies: ${item.companies_mentioned ?? "none"}\nReason: ${item.importance_reason ?? ""}`
    )
    .join("\n\n---\n\n");

  const ai = getClient();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Today is ${today}. Generate the twice-weekly briefing from these ${items.length} items:\n\n${itemDescriptions}`,
    config: {
      systemInstruction: BRIEFING_SYSTEM_PROMPT,
      maxOutputTokens: 16384,
    },
  });

  const finishReason = response.candidates?.[0]?.finishReason;
  if (finishReason === "MAX_TOKENS") {
    console.warn(
      `[briefing] Gemini response truncated (finishReason=MAX_TOKENS). ` +
        `Tokens used: ${response.usageMetadata?.candidatesTokenCount ?? "unknown"}. ` +
        `Briefing may be incomplete.`
    );
  }

  const content =
    `# Many Worlds — Quantum Signals — ${today}\n\n` +
    (response.text ?? "No briefing generated.") +
    `\n\n---\n*Generated by Many Worlds Capital Quantum Brain*`;

  const newsItemIds = items.map((item) => item.id);

  db.prepare(
    `INSERT INTO briefings (briefing_date, content, news_item_ids) VALUES (?, ?, ?)`
  ).run(today, content, JSON.stringify(newsItemIds));

  const markIncluded = db.prepare(
    `UPDATE news_items SET briefing_date = ?, briefing_included = 1 WHERE id = ?`
  );
  for (const id of newsItemIds) markIncluded.run(today, id);

  const path = writeBriefingFile(today, content);
  return { content, newsItemIds, date: today, path };
}

function writeBriefingFile(date: string, content: string): string {
  const dir = resolve(process.cwd(), "data");
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, `briefing-${date}.md`);
  writeFileSync(path, content);
  return path;
}
