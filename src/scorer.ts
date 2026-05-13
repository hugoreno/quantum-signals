import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-2.5-flash";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  }
  return client;
}

const SCORING_SYSTEM_PROMPT = `You are an analyst for Many Worlds Capital, a quantum computing VC fund.
Score each news item's importance for quantum computing investors on a 1-10 scale.

Scoring guide:
10: Industry-defining (new modality proven, major acquisition, $1B+ round)
8-9: Major news (significant funding round $50M+, major partnership, scientific breakthrough with practical implications)
6-7: Notable (new product launch, mid-size funding, important paper, personnel moves at major companies)
4-5: Relevant (incremental research, small funding, conference announcements)
1-3: Background noise (minor updates, tangential mentions of quantum)

Key companies to watch: Google Quantum AI, IBM Quantum, IonQ, Rigetti, D-Wave, Pasqal, PsiQuantum, Quantinuum (Honeywell), QuEra, Atom Computing, Alice & Bob, Amazon Braket, Microsoft, Intel, Xanadu, Infleqtion, Classiq, QC Ware, Zapata, Multiverse Computing.

For EACH item in the batch, respond with a JSON array. Each element:
{
  "id": "the item id",
  "category": "scientific" | "financial" | "partnership" | "policy" | "product",
  "subcategory": "fundraising" | "ipo_spac" | "ma" | "breakthrough" | "error_correction" | "hardware" | "software" | "algorithm" | "partnership" | "regulation" | "talent" | "earnings" | null,
  "importance_score": number (1-10),
  "importance_reason": "One sentence explaining the score",
  "companies_mentioned": ["Company1", "Company2"]
}

Return ONLY the JSON array, no other text.`;

export interface ScoreResult {
  id: string;
  category: string;
  subcategory: string | null;
  importance_score: number;
  importance_reason: string;
  companies_mentioned: string[];
}

export async function scoreNewsItems(
  items: { id: string; title: string; content: string | null }[]
): Promise<ScoreResult[]> {
  if (items.length === 0) return [];

  const ai = getClient();

  const itemDescriptions = items
    .map(
      (item, i) =>
        `[${i + 1}] ID: ${item.id}\nTitle: ${item.title}\nContent: ${(item.content ?? "").slice(0, 500)}`
    )
    .join("\n\n---\n\n");

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Score these ${items.length} news items:\n\n${itemDescriptions}`,
    config: {
      systemInstruction: SCORING_SYSTEM_PROMPT,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  });

  const text = response.text ?? "[]";

  try {
    const results = JSON.parse(text) as ScoreResult[];
    return results;
  } catch {
    console.error("Failed to parse scoring response:", text.slice(0, 200));
    return [];
  }
}
