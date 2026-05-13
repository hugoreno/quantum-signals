# Quantum Signals

A portable Rig that generates the twice-weekly **Quantum Signals** briefing — Many Worlds Capital's quantum-computing intelligence digest. Ingests news, scores with Gemini, dedups by embeddings, and produces a markdown briefing.

This is the same pipeline that powers `manyworldscapital.com`'s Mon/Thu briefing emails, repackaged as a stand-alone, self-contained rig with no Vercel or Neon dependency.

## Quickstart

Install via the [Rig CLI](https://userig.xyz):

```bash
rig use github:hugoreno/quantum-signals --dir ./qs
cd ./qs
echo "GEMINI_API_KEY=your-key-here" > .env
npm install
npm run init-db
npm run all
```

The briefing lands at `./qs/data/briefing-YYYY-MM-DD.md`.

Or clone directly:

```bash
git clone https://github.com/hugoreno/quantum-signals.git
cd quantum-signals
echo "GEMINI_API_KEY=your-key-here" > .env
npm install
npm run init-db
npm run all
```

## What you need

- **Node 20+**
- **Gemini API key** — get one at [aistudio.google.com](https://aistudio.google.com/app/apikey). Free tier is plenty for a single briefing.

A full briefing run takes ~2–3 minutes and costs a few cents in Gemini API usage.

## What it does

| Stage | What happens |
| --- | --- |
| `npm run ingest` | Pulls fresh items from Google News RSS, RSS feeds, SEC EDGAR (10 sources, configurable). |
| `npm run score` | Gemini 2.5 Flash scores each item 1–10 + assigns category, subcategory, companies. |
| `npm run dedup` | `gemini-embedding-001` + in-memory cosine similarity (≥ 0.92) clusters near-duplicates within 7 days. |
| `npm run briefing` | Synthesizes a markdown briefing from the top deduped items. Writes `data/briefing-<date>.md`. |
| `npm run all` | Runs all four in order. |

Lookback window for the briefing: **96 hours on Mondays**, **72 hours every other day** — same as production.

## Output structure

Each briefing has five sections:

```
# Many Worlds — Quantum Signals — 2026-05-11

## The Signal
[2–3 paragraphs on the single most important development]

## Scientific Developments
[Up to 5 bullets, each with a source link]

## Market & Financial
[Funding, M&A, public-market moves]

## On Our Radar
[2–3 early-signal items]

## Quick Links
[Numbered list of all referenced articles]
```

## Configuration

Edit `sources.json` to add/remove RSS feeds, Google News queries, or SEC tickers. Re-run `npm run init-db` to apply.

Edit `src/scorer.ts` (`SCORING_SYSTEM_PROMPT`) or `src/briefing.ts` (`BRIEFING_SYSTEM_PROMPT`) to tune tone or structure.

## License

MIT — feel free to fork and adapt for other domains (climate, defense, bio, etc.). The scoring/briefing prompts assume quantum-computing investor audience.
