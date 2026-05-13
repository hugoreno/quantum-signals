import { requireGeminiKey } from "../load-env.js";
import { generateBriefing } from "../briefing.js";

requireGeminiKey();

const result = await generateBriefing();
if (!result) {
  console.log("[briefing] Nothing generated.");
  process.exit(0);
}
console.log(
  `[briefing] Done. ${result.date} — ${result.newsItemIds.length} items included.\nWrote: ${result.path}`
);
