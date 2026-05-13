import { requireGeminiKey } from "../load-env.js";
import { embedAndDedup } from "../dedup.js";

requireGeminiKey();

const result = await embedAndDedup(30);
console.log(
  `[dedup] Done. Embedded ${result.embedded} items, clustered ${result.clustered} items.`
);
