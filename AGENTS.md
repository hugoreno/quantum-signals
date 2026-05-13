# Quantum Signals — Agent Instructions

This rig generates the twice-weekly **Quantum Signals** briefing for Many Worlds Capital — a quantum-focused VC fund. It mirrors the production pipeline at `quantum-brain` but runs fully locally against a SQLite database.

## What it does

Four pipeline stages, runnable individually or as a chain:

1. **Ingest** — pulls fresh items from Google News RSS, generic RSS feeds, and SEC EDGAR (10 sources, configured in `sources.json`).
2. **Score** — uses Gemini 2.5 Flash to assign each item a category, subcategory, importance score (1–10), and list of mentioned companies.
3. **Dedup** — embeds scored items with `gemini-embedding-001`, clusters near-duplicates (cosine ≥ 0.92) inside a 7-day window.
4. **Briefing** — synthesizes a markdown briefing from the top-scoring deduped items, writes it to `data/briefing-<date>.md`.

Lookback window for the briefing: 96h on Mondays, 72h every other day.

## How to run

```bash
# One-time
npm install
npm run init-db          # creates data/qs.sqlite + seeds news_sources

# Single end-to-end run
npm run all              # ingest → score → dedup → briefing

# Or run stages individually
npm run ingest
npm run score
npm run dedup
npm run briefing
```

The generated briefing lands at `data/briefing-YYYY-MM-DD.md`.

## What you need

- `GEMINI_API_KEY` in `.env` (Google Gemini API key — used for scoring, embedding, and briefing synthesis)
- Node 20+

## Notes for the coding agent

- The pipeline is **idempotent within a day**: re-running `briefing` on the same date returns the existing briefing without re-calling Gemini.
- `score` and `dedup` are **incremental** — they only touch unscored / unembedded items each run, so subsequent runs are cheap.
- `ingest` upserts on item ID (sha256 hash of url+title), so duplicate fetches are no-ops.
- SQLite file lives in `data/qs.sqlite`. Delete it and re-run `init-db` to reset state.
- Prompts (`SCORING_SYSTEM_PROMPT`, `BRIEFING_SYSTEM_PROMPT`) live in `src/scorer.ts` and `src/briefing.ts` respectively — edit there if you want to tune tone or structure.
- News sources live in `sources.json` — add RSS feeds, Google News queries, or SEC tickers there, then re-run `init-db` (it `INSERT OR IGNORE`s, so existing rows stay).

## File layout

```
src/
  db/         — SQLite schema, client, init script
  fetchers/   — RSS, Google News, SEC EDGAR fetchers
  cli/        — Entry points for each stage (ingest, score, dedup, briefing, all)
  scorer.ts   — Gemini scoring + SCORING_SYSTEM_PROMPT
  dedup.ts    — Embed + cosine-similarity dedup
  briefing.ts — Gemini briefing synthesis + BRIEFING_SYSTEM_PROMPT
  embeddings.ts — Gemini embedding wrapper
  types.ts    — Shared TS types
```
