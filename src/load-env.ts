import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Minimal .env loader. Reads KEY=VALUE pairs from the file at `path`
 * and sets them on process.env without overwriting existing values.
 */
export function loadEnv(path = ".env"): void {
  const full = resolve(process.cwd(), path);
  if (!existsSync(full)) return;

  const text = readFileSync(full, "utf-8");
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq <= 0) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

export function requireGeminiKey(): void {
  if (!process.env.GEMINI_API_KEY) {
    console.error(
      "[quantum-signals] GEMINI_API_KEY not set. Add it to .env or export it before running."
    );
    process.exit(1);
  }
}

loadEnv();
