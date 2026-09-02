// LIVE end-to-end dry run. Hits every source configured in ../Code.gs, scores
// everything with the real evaluate(), and reports volume, per-source health,
// drop reasons and segment mix. Writes nothing anywhere.
//
// Run:  node live.js
//
// This is the same accounting auditFeeds() produces inside Apps Script — use it
// after editing NEWS_QUERIES or the scoring lists to see the effect before
// deploying.
process.env.LIVE = '1';
const { API } = require('./harness.js');

const stats = [];
const t0 = Date.now();
const items = API.collectAll(stats);
const secs = ((Date.now() - t0) / 1000).toFixed(0);

// Mirrors runDailyIntentScrape()'s dedupe pipeline exactly.
const seenUrls = new Set(), seenPrints = new Set(), seenCompanies = new Set();
const kept = [], dropped = {};

items.forEach(i => {
  const nu = API.normalizeUrl(i.url);
  if (!i.url || seenUrls.has(nu)) {
    dropped['duplicate url'] = (dropped['duplicate url'] || 0) + 1; return;
  }
  const fp = i.kind === 'job' ? '' : API.fingerprint(i.title);
  if (fp && seenPrints.has(fp)) {
    dropped['duplicate headline'] = (dropped['duplicate headline'] || 0) + 1; return;
  }
  const v = API.evaluate(i);
  if (!v.keep) {
    const bucket = v.reason.split(':')[0];
    dropped[bucket] = (dropped[bucket] || 0) + 1;
    return;
  }
  if (v.companyKey && seenCompanies.has(v.companyKey)) {
    dropped['duplicate company'] = (dropped['duplicate company'] || 0) + 1; return;
  }
  if (fp) seenPrints.add(fp);
  seenUrls.add(nu);
  if (v.companyKey) seenCompanies.add(v.companyKey);
  kept.push(Object.assign({}, i, v));
});

kept.sort((a, b) => b.score - a.score);
const q = API.applySegmentQuota(kept);

console.log('\n' + '='.repeat(78));
console.log(`LIVE DRY RUN — ${secs}s, ${stats.length} sources`);
console.log('='.repeat(78));

console.log('\nPER-SOURCE (this is what auditFeeds() prints):');
console.log('  ' + 'status'.padEnd(7) + 'fetched'.padStart(8) + 'qualified'.padStart(11) + '  source');
stats.sort((a, b) => b.qualified - a.qualified || b.fetched - a.fetched).forEach(s => {
  const v = s.error ? 'ERROR' : s.fetched === 0 ? 'DEAD' : s.qualified === 0 ? 'NOISE' : 'OK';
  console.log('  ' + v.padEnd(7) + String(s.fetched).padStart(8) + String(s.qualified).padStart(11) +
              '  ' + s.label + (s.error ? '   (' + s.error.slice(0, 60) + ')' : ''));
});

console.log(`\nTOTALS`);
console.log(`  fetched            ${items.length}`);
console.log(`  qualified          ${kept.length}`);
console.log(`  saved after quota  ${q.kept.length}   (deferred ${q.deferred.length}, cap ${q.cap}/segment)`);

console.log(`\nWHY ITEMS WERE DROPPED`);
Object.entries(dropped).sort((a, b) => b[1] - a[1]).forEach(([k, n]) =>
  console.log(`  ${String(n).padStart(4)}  ${k}`));

const mix = {};
q.kept.forEach(l => { mix[l.segment] = (mix[l.segment] || 0) + 1; });
console.log(`\nSEGMENT MIX (v1 was 100% healthcare)`);
Object.entries(mix).sort((a, b) => b[1] - a[1]).forEach(([k, n]) =>
  console.log(`  ${String(n).padStart(4)}  ${k}  ${(100 * n / q.kept.length).toFixed(0)}%`));

console.log(`\nPRIORITY SPLIT`);
console.log(`  hot  (8+)  ${q.kept.filter(l => l.score >= 8).length}`);
console.log(`  warm (6-7) ${q.kept.filter(l => l.score >= 6 && l.score < 8).length}`);
console.log(`  cool (5)   ${q.kept.filter(l => l.score < 6).length}`);

console.log(`\nTOP 25 LEADS THAT WOULD BE SAVED:`);
q.kept.slice(0, 25).forEach(l => {
  console.log(`  ${l.score}/10 ${(l.segment || '-').padEnd(7)} ${(l.company || '').slice(0, 26).padEnd(27)}` +
              `${(l.intents || '').slice(0, 24).padEnd(25)} ${l.title.slice(0, 62)}`);
});

const named = q.kept.filter(l => !l.company.includes('extract manually')).length;
const domained = q.kept.filter(l => l.domain).length;
console.log(`\nOUTREACH READINESS`);
console.log(`  with a real company name  ${named}/${q.kept.length}  (${(100 * named / q.kept.length).toFixed(0)}%)`);
console.log(`  with the company's domain ${domained}/${q.kept.length}`);
console.log();
