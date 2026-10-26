// Fetches every source and scores it, writing nothing — auditFeeds() and
// previewScoring() from the Apps Script version, in one command.
//
//   npm run scrape:audit            per-source health + service mix
//   npm run scrape:audit -- --items also print every scored item
//
// Run it after editing queries or keyword lists. It does not dedupe against
// leads already saved, so it shows what each source produces, not what a real
// run would add; `GET /api/cron/scrape?dry=1` answers that.

import { evaluate, statDetail } from "../src/lib/scraper/evaluate.ts";
import { collectAll } from "../src/lib/scraper/sources.ts";
import type { SourceStat } from "../src/lib/scraper/types.ts";

const showItems = process.argv.includes("--items");
const started = Date.now();

const stats: SourceStat[] = [];
const items = await collectAll(stats);
const verdicts = items.map((item) => ({ item, verdict: evaluate(item) }));
const kept = verdicts.filter((v) => v.verdict.keep);

if (showItems) {
  console.log("KEEP? | SCORE | SEGMENT      | INTENTS / REASON                       | HEADLINE");
  for (const { item, verdict: v } of verdicts) {
    console.log(
      `${v.keep ? "KEEP" : "drop"} | ${String(v.keep ? v.score : "-").padStart(5)} | ` +
        `${(v.keep ? v.segment : "-").padEnd(12)} | ` +
        `${(v.keep ? v.intents : v.reason).substring(0, 38).padEnd(38)} | ` +
        item.title.substring(0, 70),
    );
  }
  console.log("");
}

console.log("PER SOURCE");
for (const s of [...stats].sort((a, b) => a.fetched - b.fetched)) {
  const verdict = s.error ? "ERROR" : s.fetched === 0 ? "DEAD" : s.qualified === 0 ? "NOISE" : "OK";
  console.log(`  ${verdict.padEnd(6)} ${s.label.padEnd(44)} ${statDetail(s)}`);
}

const byService: Record<string, number> = {};
for (const { verdict: v } of kept) {
  if (v.keep && v.opportunity) byService[v.opportunity] = (byService[v.opportunity] || 0) + 1;
}
console.log("\nSERVICE OPPORTUNITIES");
for (const [service, n] of Object.entries(byService).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${service}`);
}

const dead = stats.filter((s) => s.fetched === 0 || s.error).length;
const noise = stats.filter((s) => s.fetched > 0 && s.qualified === 0).length;
console.log(
  `\n${stats.length} sources · ${items.length} fetched · ${kept.length} qualified · ` +
    `${dead} dead · ${noise} noise · ${((Date.now() - started) / 1000).toFixed(1)}s`,
);
