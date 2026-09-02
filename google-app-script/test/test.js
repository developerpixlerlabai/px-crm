// Unit + regression suite for ../Code.gs
// Run:  node test.js          (offline, uses ./fixtures)
const fs = require('fs');
const path = require('path');
const { API, FIXTURES, FIXTURE_DIR } = require('./harness.js');
const fixture = (name) => fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8');

let pass = 0, fail = 0;
const ok = (cond, label, extra) => {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};

console.log('\n=== 1. cleanText: the v1 <b>-tag bug ===');
// Raw Google Alerts title, exactly as it appears in the feed
const rawAlertTitle = 'Your &lt;b&gt;Healthcare AI Strategy&lt;/b&gt; Has a Data Problem. And It&amp;#39;s an Interoperability Problem.';
const cleaned = API.cleanText(rawAlertTitle);
console.log('  cleaned:', cleaned);
ok(!cleaned.includes('<b>') && !cleaned.includes('&lt;'), 'tags stripped from title');
ok(cleaned.includes("It's"), 'double-encoded entity decoded (&amp;#39; -> apostrophe)', cleaned);
// The critical case: v1 could never match "series a" because of the bold tag
ok(API.cleanText('LemonEdge lands $21m &lt;b&gt;Series A&lt;/b&gt;').toLowerCase().includes('series a'),
   '"series a" now matches across a <b> boundary');

console.log('\n=== 2. Google News RSS parser (real feed, 27 items) ===');
FIXTURES['news.google.com'] = { code: 200, body: fixture('google-news-rss.xml') };
const gitems = API.fetchGoogleNews({ label: 'T', segment: 'saas', q: 'test' });
console.log('  parsed items:', gitems.length);
ok(gitems.length >= 25, 'parsed all items from the real feed', gitems.length);
ok(gitems.every(i => i.title && i.url), 'every item has title + url');
const withPub = gitems.filter(i => i.publisher);
ok(withPub.length >= 25, 'publisher extracted from <source>', withPub.length);
ok(gitems.every(i => !/ - (Tracxn|Unite\.AI|Benzinga)$/.test(i.title)), 'publisher suffix stripped from headline');
ok(gitems.some(i => i.publishedAt instanceof Date), 'pubDate parsed');
console.log('  sample:', JSON.stringify(gitems.slice(0, 3).map(i => i.title)));

console.log('\n=== 3. Atom / legacy Google Alerts parser (real feed, 20 entries) ===');
FIXTURES['alerts/feeds'] = { code: 200, body: fixture('google-alert-atom.xml') };
const aitems = API.fetchAtomAlert({ label: 'A', segment: 'health', url: 'https://www.google.com/alerts/feeds/x/y' });
console.log('  parsed entries:', aitems.length);
ok(aitems.length >= 18, 'parsed the Atom entries', aitems.length);
ok(aitems.every(i => !i.title.includes('<b>')), 'no raw <b> tags survive into the Headline');
ok(aitems.every(i => !/^https?:\/\/www\.google\.com\/url/.test(i.url)), 'google redirect unwrapped to the real article URL');
console.log('  sample url:', aitems[0] && aitems[0].url);

console.log('\n=== 4. Company extraction ===');
const cases = [
  ['Obsidian Security Raises $85 Million Series D at $1.1 Billion Valuation', 'Obsidian Security'],
  ['Private markets fintech LemonEdge lands $21m Series A', null], // leading lowercase words — expect miss
  ['Acme Health raises $12M to expand AI triage', 'Acme Health'],
  ['Brightwave, a B2B software startup, hires its first Head of AI', 'Brightwave'],
  ['Nuvia Labs announces AI-powered claims platform', 'Nuvia Labs'],
  ['TechCrunch launches a new newsletter', null], // publisher must be rejected
  ['How to build an AI strategy', null],
];
cases.forEach(([title, want]) => {
  const got = API.extractCompanyName(title, '');
  const good = want === null ? !API.isRealCompany(got) : got === want;
  ok(good, `"${title.slice(0, 52)}" -> ${JSON.stringify(got)}`, want);
});

console.log('\n=== 5. THE HEALTHCARE SKEW FIX (v1 vs v2 on identical inputs) ===');
// v1 scoring, reproduced exactly from the original file
const V1 = {
  HIGH: ["series a","series b","funding round","raised $","hiring ai","ai engineer","machine learning engineer","we're building ai","investing in ai","ai strategy","automation engineer","head of automation","clinical ai","healthcare ai","medtech ai","digital health","health tech"],
  MEDIUM: ["digital transformation","technology investment","product launch","new product","platform launch","automation","ai powered","ai-powered","intelligent","saas","b2b software","enterprise software","telemedicine","telehealth","healthtech","medtech"],
  LOW: ["hiring","growing team","new hire","job opening","technology","software","platform","innovation","efficiency","productivity","data driven","data-driven"],
  NEGATIVE: ["nhs","government","federal","non-profit","nonprofit","hospital system","enterprise 1000","fortune 500","academic","university","research paper","study finds"],
};
function v1score(text) {
  text = text.toLowerCase();
  let s = 0;
  V1.HIGH.forEach(k => { if (text.includes(k)) s += 3; });
  V1.MEDIUM.forEach(k => { if (text.includes(k)) s += 2; });
  V1.LOW.forEach(k => { if (text.includes(k)) s += 1; });
  V1.NEGATIVE.forEach(k => { if (text.includes(k)) s -= 3; });
  return Math.min(10, Math.max(0, s));
}
const mk = (title, snippet, pub) => ({
  title, snippet: snippet || '', url: 'https://x.com/' + Math.random(),
  publishedAt: new Date(), sourceLabel: 'test', segmentHint: '',
  company: '', contactTitle: '', publisher: pub || '', domain: '',
});

const probes = [
  ['HEALTH topic article (competitor blog — NOT a lead)',
   "Your Healthcare AI Strategy Has a Data Problem. And It's an Interoperability Problem.", ''],
  ['HEALTH generic topic piece (NOT a lead)',
   'Digital health and health tech: how healthcare AI and telehealth are reshaping medtech', ''],
  ['SAAS real signal (IS a lead)',
   'Obsidian Security Raises $85 Million Series D at $1.1 Billion Valuation', ''],
  ['SAAS real signal (IS a lead)',
   'Brightwave is hiring an AI engineer to build its B2B SaaS automation platform', ''],
  ['HEALTH real signal (IS a lead)',
   'Acme Health raises $18M Series A to expand its clinical AI platform', ''],
  ['Earnings noise (NOT a lead)',
   'Cencora Sees Specialty Growth Continue While GLP-1 Mix Weighs on Margins', 'Benzinga'],
  ['Market report (NOT a lead)',
   'FinTech SaaS - 2026 Market & Investments Trends', 'Tracxn'],
  ['Student competition (NOT a lead)',
   'Hakeem Academy Competition Showcases Student Innovation in Digital Healthcare', ''],
];

console.log('  ' + 'case'.padEnd(52) + 'v1     v2');
probes.forEach(([label, title, pub]) => {
  const v = API.evaluate(mk(title, '', pub));
  const v1 = v1score(title);
  const v2 = v.keep ? String(v.score) : 'drop';
  console.log('  ' + label.padEnd(52) +
    String(v1).padEnd(7) + v2.padEnd(6) +
    (v.keep ? `[${v.segment}] ${v.intents}` : `(${v.reason})`));
});

// Assertions on the ones that matter
const ev = (t, p) => API.evaluate(mk(t, '', p));
ok(!ev("Your Healthcare AI Strategy Has a Data Problem. And It's an Interoperability Problem.").keep,
   'competitor blog post no longer becomes a lead (v1 scored it 6+)');
ok(!ev('Digital health and health tech: how healthcare AI and telehealth are reshaping medtech').keep,
   'pure healthcare topic article dropped (v1 scored it 10/10)');
ok(!ev('Cencora Sees Specialty Growth Continue While GLP-1 Mix Weighs on Margins', 'Benzinga').keep,
   'earnings coverage dropped');
ok(!ev('FinTech SaaS - 2026 Market & Investments Trends', 'Tracxn').keep, 'market report dropped');
ok(!ev('Hakeem Academy Competition Showcases Student Innovation in Digital Healthcare').keep,
   'student competition dropped');

const saas1 = ev('Obsidian Security Raises $85 Million Series D at $1.1 Billion Valuation');
ok(saas1.keep && saas1.score >= 6, 'real SaaS funding signal kept and scored Warm+', saas1);
const saas2 = ev('Brightwave is hiring an AI engineer to build its B2B SaaS automation platform');
ok(saas2.keep, 'real SaaS hiring signal kept', saas2);
ok(saas2.segment === 'saas', 'SaaS signal tagged saas', saas2.segment);
const health1 = ev('Acme Health raises $18M Series A to expand its clinical AI platform');
ok(health1.keep && health1.segment === 'health', 'real health signal kept and tagged health', health1);

console.log('\n  v1 vs v2 on the two topic-only healthcare items:');
console.log('    v1 gave them ' + v1score('Digital health and health tech: how healthcare AI and telehealth are reshaping medtech') + '/10 and saved them.');
console.log('    v2 drops both — no trigger event.');

console.log('\n=== 6. Synonym stacking cannot inflate a score ===');
const stacked = ev('Healthcare AI, clinical AI, medtech AI, digital health and health tech company raises $10M Series A');
const single  = ev('Acme raises $10M Series A');
console.log('  9 vertical keywords + funding =', stacked.score, '| funding only =', single.score);
ok(stacked.score - single.score <= 2,
   'piling on vertical synonyms adds ~nothing (v1 would add +15 before clamping)',
   { stacked: stacked.score, single: single.score });

console.log('\n=== 7. Segment quota ===');
const many = [];
for (let i = 0; i < 20; i++) many.push({ segment: 'health', score: 9 - (i % 3), sourceLabel: 'h' + i });
for (let i = 0; i < 4; i++)  many.push({ segment: 'saas',   score: 8, sourceLabel: 's' + i });
const q = API.applySegmentQuota(many.sort((a, b) => b.score - a.score));
console.log('  counts:', q.counts, 'cap:', q.cap, 'deferred:', q.deferred.length);
ok(q.counts.health <= q.cap, 'health capped', q.counts);
ok(q.counts.saas === 4, 'all saas kept', q.counts);
ok(q.deferred.length > 0, 'excess deferred, not dropped forever');

console.log('\n=== 8. Dedupe: Google News gives a different URL per query ===');
const t = 'Obsidian Security Raises $85 Million Series D';
ok(API.fingerprint(t) === API.fingerprint(t + ' - Unite.AI'),
   'same story w/ different publisher suffix -> same fingerprint');
ok(API.fingerprint(t) !== API.fingerprint('Acme Health raises $18M Series A'),
   'different stories -> different fingerprints');
ok(API.normalizeUrl('https://www.Example.com/a/?utm_source=x#f') === 'example.com/a',
   'url normalized', API.normalizeUrl('https://www.Example.com/a/?utm_source=x#f'));

console.log('\n=== 9. HN Who-is-hiring parser (real API shape) ===');
// Mirrors the real API: date-sorted results include decoy discussion threads
// before the actual monthly thread. The old code took hits[0] blindly, which
// (with relevance sort) landed on the 2020 thread.
FIXTURES['tags=story&hitsPerPage=20'] = { code: 200, body: JSON.stringify({ hits: [
  { objectID: '49163218', title: 'Ask HN: Why is the "Who is hiring?" post being removed?' },
  { objectID: '49156683', title: 'Ask HN: Who is hiring? (August 2026)' },
]}) };
FIXTURES['tags=comment,story_'] = { code: 200, body: JSON.stringify({ hits: [
  { objectID: '1', created_at: new Date().toISOString(),
    comment_text: 'Adalat AI | <a href="https:&#x2F;&#x2F;www.adalat.ai">https:&#x2F;&#x2F;www.adalat.ai</a> | Remote | ML Engineer | We use machine learning for courts' },
  { objectID: '2', created_at: new Date().toISOString(),
    comment_text: 'Boring Widgets Inc | Remote | Sales rep | nothing technical here' },
  { objectID: '3', created_at: new Date().toISOString(),
    comment_text: 'Chairman Ltd | we said we maintain available seats' },  // must NOT match bare "ai"
]}) };
const hn = API.fetchHackerNewsHiring();
console.log('  kept posts:', hn.map(h => ({ company: h.company, domain: h.domain })));
ok(hn.length === 1, 'only the AI/ML posting kept (bare-"ai"-substring bug fixed)', hn.length);
ok(hn[0].company === 'Adalat AI', 'company parsed from pipe format', hn[0].company);
ok(hn[0].domain === 'adalat.ai', 'company domain extracted -> outreach ready', hn[0].domain);
const hnEval = API.evaluate(hn[0]);
ok(hnEval.keep, 'HN posting qualifies as a lead', hnEval);
ok(hnEval.score >= 7, 'HN posting scores high (company + domain + fresh)', hnEval.score);

console.log('\n=== 10. Remotive parser (real API shape) ===');
FIXTURES['remotive.com/api'] = { code: 200, body: JSON.stringify({ jobs: [
  { title: 'Senior AI Engineer', company_name: 'Coalition Technologies ', candidate_required_location: 'Worldwide',
    url: 'https://remotive.com/x/1', publication_date: new Date().toISOString(), description: '<p>Build <b>LLM</b> pipelines</p>' },
  { title: 'Senior ML Engineer', company_name: 'Fenced Ltd', candidate_required_location: 'Americas, Europe, Israel',
    url: 'https://remotive.com/x/2', publication_date: new Date().toISOString(), description: 'models' },
  { title: 'Copywriter', company_name: 'Elsewhere Ltd', candidate_required_location: 'Worldwide',
    url: 'https://remotive.com/x/3', publication_date: new Date().toISOString(), description: 'words' },
]}) };
const rem = API.fetchRemotive();
// The fetcher no longer filters on geography — it hands the structured
// location to evaluate_ so every geographic drop is visible in the audit.
ok(rem.length === 2, 'copywriter dropped on title; both engineers reach scoring', rem.length);
ok(rem[0].company === 'Coalition Technologies', 'company name trimmed', rem[0].company);
ok(!rem[0].snippet.includes('<b>'), 'description tags stripped');
ok(rem[0].locationField === 'Worldwide', 'structured location passed through to evaluate_');
ok(API.evaluate(rem[0]).keep, 'worldwide AI role qualifies');
const remFenced = API.evaluate(rem[1]);
ok(!remFenced.keep && /out of reach/.test(remFenced.reason),
   '"Americas, Europe, Israel" is genuinely remote and still closed to India', remFenced.reason);

console.log('\n=== 11. Row shape matches headers ===');
const row = API.buildLeadRow(Object.assign({}, mk('Acme raises $10M Series A'), API.evaluate(mk('Acme raises $10M Series A'))));
ok(row.length === API.LEAD_HEADERS.length, `row width ${row.length} === headers ${API.LEAD_HEADERS.length}`);
ok(row[12] === 'New', 'Status column defaults to New');
ok(API.LEAD_HEADERS[11] === 'Source URL', 'URL is still column L (dedupe reads L)');
ok(API.LEAD_HEADERS[9] === 'Headline', 'Headline is still column J');

console.log('\n=== 12. Regressions on the anyCase() verb expansion ===');
ok(API.anyCase('raises') === '[Rr][Aa][Ii][Ss][Ee][Ss]', 'anyCase builds a valid class', API.anyCase('raises'));
ok(API.extractCompanyName('Vantly Raises $30M', '') === 'Vantly', 'capitalized headline verb matches');
ok(API.extractCompanyName('Vantly raises $30M', '') === 'Vantly', 'lowercase verb matches too');


console.log('\n=== 13. Regression tests for the live-run defects ===');
// Geography. v2 rejected all four of these as "non-US" — they were the
// original reason NON_US_HARD exists. Delivering from India, a funded startup
// is a prospect wherever it is, so under NEWS_GEO "global" they are leads.
[['Superleap Raises Rs 36 Cr In Series A Led By Peak XV'],
 ['Saudi AIoT Startup Rime Raises $2 Million Seed Round'],
 ["Bulgaria's Estel Technologies raises 270,000 euro in pre-seed"],
 ['GetVantage Raises Rs 63 Crore in Series A1 Round']].forEach(([t]) => {
  const v = API.evaluate(mk(t));
  ok(v.keep, `global funding news now kept: ${t.slice(0,48)}`, v.reason);
});
const usLead = API.evaluate(mk('Obsidian Security Raises $85 Million Series D, San Francisco'));
ok(usLead.keep, 'US lead still kept — global means global, not "anywhere but here"');

// Wrong buyer
ok(!API.evaluate(mk('PCI Federal Names Todd Hughes VP of AI Strategy')).keep,
   'government contractor rejected');

// Descriptor stripping
ok(API.extractCompanyName('Enterprise AI Startup Superleap Raises $5M', '') === 'Superleap',
   'descriptor prefix stripped', API.extractCompanyName('Enterprise AI Startup Superleap Raises $5M', ''));
ok(API.extractCompanyName("Bulgaria's Estel Technologies raises $1M", '') === 'Estel Technologies',
   'possessive prefix stripped', API.extractCompanyName("Bulgaria's Estel Technologies raises $1M", ''));
ok(API.extractCompanyName('Medallia Completes Recapitalization, Secures $150 Million', '') === 'Medallia',
   '"completes" now a recognized action verb', API.extractCompanyName('Medallia Completes Recapitalization, Secures $150 Million', ''));

// Jobs must NOT be hit by the news-noise list (this rejected 100% of jobs)
const job = { kind: 'job', title: 'Senior AI Engineer @ Acme', company: 'Acme',
  snippet: 'Requires a university degree. Learn how to build LLM pipelines. Python vs. Go.',
  url: 'https://x/1', publishedAt: new Date(), sourceLabel: 'j', segmentHint: 'saas',
  locationHint: 'Worldwide', locationField: 'Worldwide',
  contactTitle: 'Hiring Manager', publisher: 'Remotive', domain: '' };
const jv = API.evaluate(job);
ok(jv.keep, 'job with "university"/"how to"/"vs." in the description still qualifies', jv.reason);
const newsSame = API.evaluate(mk('Acme hiring AI engineer', 'Requires a university degree'));
ok(!newsSame.keep, 'the same words in NEWS are still rejected', newsSame.reason);

// Jobs get the longer recency window
const oldJob = Object.assign({}, job, { publishedAt: new Date(Date.now() - 21 * 86400000) });
ok(API.evaluate(oldJob).keep, '21-day-old job posting still qualifies (JOB_RECENCY_DAYS)');
const oldNews = mk('Acme raises $10M Series A');
oldNews.publishedAt = new Date(Date.now() - 21 * 86400000);
ok(!API.evaluate(oldNews).keep, '21-day-old news is dropped (RECENCY_DAYS)');

// Remotive title relevance
ok(!API.CONFIG.RELEVANT_JOB_TITLE.test('Freelance Copywriter'), 'copywriter filtered');
ok(!API.CONFIG.RELEVANT_JOB_TITLE.test('Patient Care Specialist'), 'patient care filtered');
ok(API.CONFIG.RELEVANT_JOB_TITLE.test('Senior Independent AI Engineer / Architect'), 'AI role kept');
ok(API.CONFIG.RELEVANT_JOB_TITLE.test('Head of Automation'), 'automation role kept');


console.log('\n=== 14. normalizeUrl must preserve identity-bearing params ===');
ok(API.normalizeUrl('https://news.ycombinator.com/item?id=1') !==
   API.normalizeUrl('https://news.ycombinator.com/item?id=2'),
   'HN item ids stay distinct (83 of 84 leads were lost to this)');
ok(API.normalizeUrl('https://a.com/x?utm_source=n&id=5') === 'a.com/x?id=5',
   'tracking params dropped, real params kept', API.normalizeUrl('https://a.com/x?utm_source=n&id=5'));
ok(API.normalizeUrl('https://news.google.com/rss/articles/CBM?oc=5') ===
   'news.google.com/rss/articles/cbm', 'Google oc= param dropped');
ok(API.normalizeUrl('https://a.com/x?b=2&a=1') === API.normalizeUrl('https://a.com/x?a=1&b=2'),
   'param order does not matter');

console.log('\n=== 15. HN company parsing ===');
const hnCases = [
  ['Adalat AI | https://adalat.ai | Remote | ML Engineer', 'adalat.ai', 'Adalat AI'],
  ['NYC | ONSITE (hybrid) Norm Ai, the agentic law firm | AI eng', 'norm.ai', 'Norm'],
  ['REMOTE | Coder | Senior Engineer', 'coder.com', 'Coder'],
  ['SF | | | ', 'ojin.ai', 'Ojin'],
];
hnCases.forEach(([raw, dom, want]) => {
  const got = API.parseHnCompany(raw, dom);
  ok(got === want, `"${raw.slice(0, 40)}" -> ${JSON.stringify(got)}`, want);
});


console.log('\n=== 16. Final HN + geo regressions ===');
ok(API.parseHnCompany('ML6 | Ghent | Python, TensorFlow, PyTorch, GCP, AWS, Azure', 'ml6.eu') === 'ML6',
   'ALL-CAPS company kept when the alternative is a tech stack', API.parseHnCompany('ML6 | Ghent | Python, TensorFlow, PyTorch, GCP, AWS, Azure', 'ml6.eu'));
ok(API.parseHnCompany('NYC | ONSITE (hybrid) Norm Ai | AI eng', 'norm.ai') === 'Norm',
   'location-first post still resolves via domain');
ok(API.parseHnCompany('Acme Corp | NYC | Senior Engineer', '') === 'Acme Corp', 'normal case unaffected');
const berlinJob = { kind: 'job', title: 'Prior Labs is hiring — Prior Labs | Berlin / Freiburg / NYC | ML eng',
  company: 'Prior Labs', snippet: '', url: 'https://x/9', publishedAt: new Date(),
  sourceLabel: 'hn', segmentHint: 'saas', locationHint: 'Berlin / Freiburg / NYC', publisher: '', domain: '' };
ok(!API.evaluate(berlinJob).keep,
   'an office job in Berlin is still not ours to take', API.evaluate(berlinJob).reason);
ok(/out of reach: onsite/.test(API.evaluate(berlinJob).reason),
   '...and it is rejected for being onsite, not for being foreign',
   API.evaluate(berlinJob).reason);


console.log('\n=== 17. Run-dropdown / unbound-project guards ===');
const H = require('./harness.js');

// The reported failure: getOrCreateSheet left selected in the Run dropdown and
// invoked with no arguments -> "Cannot read properties of undefined".
let err = null;
try { API.getOrCreateSheet(); } catch (e) { err = e.message; }
ok(err && /can't be run on its own/.test(err), 'bare call gives an actionable error, not a TypeError', err);
ok(err && /auditFeeds/.test(err), 'error names the real entry points');
ok(!/undefined/.test(String(err)), 'error text is not a raw TypeError', err);

// Called properly with an explicit spreadsheet
ok(API.getOrCreateSheet(H.FAKE_SHEET, 'Leads')._name === 'Leads', 'normal 2-arg call still works');
// Called with a name but no spreadsheet -> falls back to the active one
ok(API.getOrCreateSheet(null, 'Leads')._name === 'Leads', 'missing ss falls back to the active spreadsheet');

// Standalone (unbound) project: getActiveSpreadsheet() returns null
H.SHEET = null;
let err2 = null;
try { API.getSpreadsheet_(); } catch (e) { err2 = e.message; }
ok(err2 && /container-bound/.test(err2), 'unbound project explains it must be container-bound', err2);
H.SHEET = H.FAKE_SHEET;

ok(API.getSpreadsheet_() === H.FAKE_SHEET, 'guard returns the spreadsheet when bound');
ok(API.ENTRY_POINTS[0] === 'smokeTest', 'smokeTest is the documented first step', API.ENTRY_POINTS[0]);
ok(API.ENTRY_POINTS.indexOf('auditFeeds') === 1, 'auditFeeds comes second');
ok(API.ENTRY_POINTS.indexOf('getOrCreateSheet') === -1, 'no private helper is advertised as an entry point');


console.log('\n=== 18. Reporting must never block the execution ===');
// auditFeeds() logged its table then hung ~6 minutes and died with "Exceeded
// maximum execution time": getUi().alert() renders a modal in the SHEET and
// waits for a click, and getUi() does not throw when run from the editor.
H.TOASTS.length = 0; H.UI_CALLS.length = 0; H.LOGS.length = 0;
API.safeAlert('FEED AUDIT COMPLETE\n\nSources checked: 14\nItems fetched: 468');

ok(H.UI_CALLS.length === 0, 'never calls getUi() — that is the blocking path', H.UI_CALLS);
ok(H.TOASTS.length === 1, 'uses a non-blocking toast instead', H.TOASTS.length);
ok(H.TOASTS[0].msg === 'FEED AUDIT COMPLETE', 'toast shows the first line', H.TOASTS[0].msg);
ok(H.TOASTS[0].msg.length <= 250, 'toast text is length-capped');
ok(H.LOGS.some(l => l.indexOf('Items fetched: 468') !== -1),
   'full multi-line detail still reaches the Logger');

// A time-based trigger has no sheet UI at all; that must not kill the run.
H.SHEET = null;
let threw = false;
try { API.safeAlert('trigger run complete'); } catch (e) { threw = true; }
ok(!threw, 'survives having no spreadsheet UI (time-based trigger)');
ok(H.LOGS.some(l => l.indexOf('trigger run complete') !== -1), 'still logged with no UI');
H.SHEET = H.FAKE_SHEET;


console.log('\n=== 19. Feeds are fetched in ONE parallel batch ===');
// Serial fetching of 14 feeds burned ~54s of the 6-minute execution quota.
FIXTURES['news.google.com'] = { code: 200, body: fixture('google-news-rss.xml') };
FIXTURES['bing.com']        = { code: 200, body: fixture('google-news-rss.xml') };
FIXTURES['alerts/feeds']    = { code: 200, body: fixture('google-alert-atom.xml') };

H.BATCHES.length = 0; H.FETCHALL_THROWS = false;
let stats = [];
let items = API.collectAll(stats);

// Derived, never hardcoded — and it must honour `enabled: false` exactly the
// way collectAll_ does, or every disabled query breaks this assertion instead
// of the thing it is meant to guard.
const enabledQueries = API.CONFIG.NEWS_QUERIES.filter(q => q.enabled !== false);
const expectedFeeds =
  enabledQueries.length +
  (API.CONFIG.USE_BING ? enabledQueries.filter(q => q.bing).length : 0) +
  API.CONFIG.LEGACY_ALERT_FEEDS.filter(f => f.enabled).length;

ok(H.BATCHES.length === 1, 'exactly one fetchAll() call for all feeds', H.BATCHES);
ok(H.BATCHES[0] === expectedFeeds,
   `batch carried all ${expectedFeeds} feeds at once`, H.BATCHES[0]);
ok(items.length > 0, 'batched path still yields items', items.length);
ok(stats.filter(s => s.fetched > 0).length >= expectedFeeds - 1,
   'each feed still gets its own stat row', stats.length);

console.log('\n=== 20. fetchAll outage degrades, never wipes out the news ===');
// fetchAll() is all-or-nothing — if the call throws, every feed dies with it.
H.BATCHES.length = 0; H.FETCHALL_THROWS = true;
let stats2 = [];
let items2 = API.collectAll(stats2);
ok(items2.length > 0, 'sequential fallback still returns items', items2.length);
ok(items2.length === items.length, 'fallback returns the same items as the batch',
   { batched: items.length, fallback: items2.length });
H.FETCHALL_THROWS = false;

// A single bad feed must not take down the others
H.BATCHES.length = 0;
const savedGN = FIXTURES['news.google.com'];
FIXTURES['news.google.com'] = { code: 503, body: 'upstream boom' };
let stats3 = [];
API.collectAll(stats3);
const errored = stats3.filter(s => s.error || s.fetched === 0);
ok(errored.length > 0, 'the broken feed is recorded as an error row');
ok(errored.some(s => /HTTP 503/.test(String(s.error))), 'error names the HTTP status',
   errored.map(s => s.error).filter(Boolean).slice(0, 2));
ok(stats3.some(s => s.fetched > 0), 'other feeds still delivered despite the failure');
FIXTURES['news.google.com'] = savedGN;

console.log('\n=== 21. URL builders ===');
const gq = { label: 'x', segment: 'saas', q: '"Series A" SaaS when:7d' };
ok(API.googleNewsUrl(gq).indexOf('hl=en-US&gl=US&ceid=US:en') !== -1, 'Google News URL pins US locale');
ok(API.googleNewsUrl(gq).indexOf('when%3A7d') !== -1, 'query is URL-encoded, when: preserved');
ok(API.bingNewsUrl(gq).indexOf('when') === -1, 'Bing URL strips the unsupported when: operator');
ok(API.bingNewsUrl(gq).indexOf('format=RSS') !== -1, 'Bing URL requests RSS');


console.log('\n=== 22. Runtime budget + phase logging ===');
// A run killed at 6 minutes writes NOTHING and loses the whole fetch. The clock
// lets the run stop voluntarily and still save what it has.
H.LOGS.length = 0;
const clock = API.startClock('unit');
ok(typeof clock.seconds() === 'number', 'clock reports elapsed seconds');
ok(clock.overBudget() === false, 'a fresh clock is within budget');
clock.phase('doing a thing');
ok(H.LOGS.some(l => /unit started/.test(l)), 'logs a start marker for the Executions view');
ok(H.LOGS.some(l => /doing a thing/.test(l)), 'logs each phase boundary');
ok(H.LOGS.some(l => /\[\d+\.\ds\]/.test(l)), 'phase lines carry a timestamp', H.LOGS);

// The budget must be readable from CONFIG and leave headroom under the 6min cap
ok(API.CONFIG.MAX_RUNTIME_SECONDS > 0, 'budget is configured');
ok(API.CONFIG.MAX_RUNTIME_SECONDS < 360,
   'budget leaves headroom under the hard 6-minute limit', API.CONFIG.MAX_RUNTIME_SECONDS);

// collectAll must work whether or not a clock is supplied
let statsA = [];
ok(API.collectAll(statsA).length > 0, 'collectAll works with no clock passed');
let statsB = [];
ok(API.collectAll(statsB, API.startClock('supplied')).length > 0, 'collectAll works with a clock');

// An exhausted budget must skip job boards rather than overrun
const spent = { seconds: () => 999, overBudget: () => true, phase: () => {} };
let statsC = [];
API.collectAll(statsC, spent);
ok(statsC.some(s => s.label === 'Job boards' && /budget/i.test(String(s.error))),
   'over-budget run skips job boards and records why',
   statsC.filter(s => s.label === 'Job boards'));
ok(!statsC.some(s => /HN: Who is hiring/.test(s.label)), 'HN not fetched when over budget');


console.log('\n=== 23. HN posting field extraction ===');
const post = (raw, co) => API.parseHnPosting(raw, co || '');
// Salary must carry a "k" or comma-thousands — the loose pattern reported "$30"
// (from "$30M raised") as compensation.
ok(post('Acme | AI Engineer | $180K-$230K + equity').salary === '$180K-$230K',
   'range salary parsed', post('Acme | AI Engineer | $180K-$230K').salary);
ok(post('Acme | we raised $30M last year').salary === '', 'funding amount is not a salary',
   post('Acme | we raised $30M last year').salary);
ok(post('Acme | $400 signing bonus mention').salary === '', 'bare $400 rejected',
   post('Acme | $400 signing bonus mention').salary);
ok(post('Acme | $130,000 - $200,000').salary !== '', 'comma-thousands salary parsed');
// Locations are shouted in HN posts; the case-sensitive test missed them all
ok(post('Acme | REMOTE (North America only) | AI Engineer').location.indexOf('REMOTE') === 0,
   'uppercase REMOTE detected', post('Acme | REMOTE (North America only) | AI Engineer').location);
ok(post('Acme | Austin, TX | Data Engineer').location === 'Austin, TX', 'City, ST detected');
ok(post('Acme | ONSITE | ML Engineer').role === 'ML Engineer', 'role picked over location');
ok(post('Acme | Acme | Backend Engineer', 'Acme').role === 'Backend Engineer',
   'company segment not mistaken for a role');

console.log('\n=== 24. Generic link hosts must not become company names ===');
// Input must have no usable segment so the DOMAIN fallback is what's exercised
// ("Senior Engineer" is role noise and gets skipped).
[['linkedin.com', ''], ['drive.google.com', ''], ['docs.google.com', ''],
 ['jobs.ashbyhq.com', ''], ['bit.ly', ''], ['adalat.ai', 'Adalat']].forEach(([dom, want]) => {
  const got = API.parseHnCompany('Senior Engineer', dom);
  ok(got === want, `${dom} -> ${JSON.stringify(got)}`, want);
});
ok(API.parseHnCompany('Oscilar.com | REMOTE | Engineer', 'x.io') === 'Oscilar',
   'trailing TLD stripped from a pipe-derived company',
   API.parseHnCompany('Oscilar.com | REMOTE | Engineer', 'x.io'));

console.log('\n=== 25. Digest email ===');
const mkLead = (o) => Object.assign({
  score: 9, company: 'Acme', segment: 'saas', intents: 'Funding', sourceLabel: 'GNews: x',
  title: 'Acme raises $10M Series A', url: 'https://ex.com/a', domain: '', kind: 'news',
  role: '', location: '', salary: '', snippet: ''
}, o);
const mkQuota = (kept) => ({ kept, deferred: [], cap: 10, counts: { saas: kept.length } });

H.MAILS.length = 0;
API.sendDailyDigest([mkLead({}), mkLead({ score: 6, company: 'Beta' })],
                    mkQuota([mkLead({}), mkLead({ score: 6 })]), []);
let [to, subj, plain, opts] = H.MAILS[0];
const html = opts.htmlBody;

ok(to === API.CONFIG.NOTIFICATION_EMAIL, 'sent to the configured address', to);
ok(subj.indexOf(API.CONFIG.AGENCY_NAME) !== -1, 'subject carries the agency name', subj);
ok(![...html].some(c => c.codePointAt(0) > 0xFFFF),
   'no astral-plane emoji — those rendered as diamonds in Gmail');
ok(!/display\s*:\s*flex/.test(html), 'no flexbox — Gmail strips it');
const bal = t => (html.match(new RegExp('<' + t + '\\b', 'g')) || []).length ===
                 (html.match(new RegExp('</' + t + '>', 'g')) || []).length;
ok(bal('table') && bal('tr') && bal('td'), 'table markup is balanced');
ok(!/(src|@import)\s*=?\s*["']?https?:/.test(html), 'no external image or font requests');
ok(plain.length > 40 && plain.indexOf('Acme') !== -1, 'plain-text alternative is real content');
ok(html.indexOf('linkedin.com/search') !== -1, 'includes a find-contacts link');

// Long runs must be capped, not dumped
H.MAILS.length = 0;
const sixty = [];
for (let i = 0; i < 60; i++) sixty.push(mkLead({ company: 'Co' + i, score: 9 }));
API.sendDailyDigest(sixty, mkQuota(sixty), []);
const bigHtml = H.MAILS[0][3].htmlBody;
const cards = (bigHtml.match(/border-left:3px solid/g) || []).length;
ok(cards === API.CONFIG.DIGEST_MAX_LEADS,
   `itemises ${API.CONFIG.DIGEST_MAX_LEADS} leads, not all 60`, cards);
ok(/\+ 35 more/.test(bigHtml), 'tells you how many are only in the sheet');

// A job with no structured fields must not render a blank detail line
H.MAILS.length = 0;
const bare = mkLead({ kind: 'job', role: '', location: '', salary: '',
                      snippet: 'We are hiring engineers to work on LLM infra.' });
API.sendDailyDigest([bare], mkQuota([bare]), []);
ok(H.MAILS[0][3].htmlBody.indexOf('LLM infra') !== -1,
   'falls back to the post text when role/location/salary are all missing');

// Dead sources must surface in the email, not just the Run Log
H.MAILS.length = 0;
API.sendDailyDigest([mkLead({})], mkQuota([mkLead({})]),
                    [{ label: 'GNews: dead one', fetched: 0, qualified: 0, error: null }]);
ok(/returned nothing/.test(H.MAILS[0][3].htmlBody), 'dead source warning appears in the digest');
ok(H.MAILS[0][3].htmlBody.indexOf('GNews: dead one') !== -1, 'names the dead source');

console.log('\n=== 26. fmtDate ===');
ok(API.fmtDate(new Date(2026, 7, 6)) === 'Thu 6 Aug 2026', 'readable date',
   API.fmtDate(new Date(2026, 7, 6)));


console.log('\n=== 27. isGenericHost_ (the -1 === -1 bug) ===');
// Same-length host vs blocklist entry must NOT collide.
[['adalat.ai', false], ['notion.so', true], ['acme.com', false], ['linkedin.com', true],
 ['ojin.ai', false], ['jobvite.com', true], ['drive.google.com', true],
 ['sub.acme.io', false], ['careers.notion.so', true], ['www.linkedin.com', true],
 ['bit.ly', true], ['norm.ai', false]].forEach(([host, want]) => {
  ok(API.isGenericHost(host) === want, `${host} generic=${API.isGenericHost(host)}`, want);
});


console.log('\n=== 28. No literal HTML entities in the rendered text ===');
H.MAILS.length = 0;
const jobLead = mkLead({ kind: 'job', role: 'AI Engineer',
  location: 'REMOTE (North America only)', salary: '$180K-$230K',
  company: 'Portless', domain: 'portless.com' });
API.sendDailyDigest([jobLead], mkQuota([jobLead]), []);
const jh = H.MAILS[0][3].htmlBody;
ok(jh.indexOf('&amp;middot;') === -1, 'separator is not double-escaped into &amp;middot;');
ok(jh.indexOf('AI Engineer') !== -1 && jh.indexOf('$180K-$230K') !== -1,
   'role and salary both present');
// An ampersand in real data must still be escaped exactly once
H.MAILS.length = 0;
const ampLead = mkLead({ company: 'Ben & Jerry AI', title: 'Ben & Jerry AI raises $5M' });
API.sendDailyDigest([ampLead], mkQuota([ampLead]), []);
const ah = H.MAILS[0][3].htmlBody;
ok(ah.indexOf('Ben &amp; Jerry AI') !== -1, 'a real & is escaped once');
ok(ah.indexOf('&amp;amp;') === -1, 'and not twice');


console.log('\n=== 29. Company extraction: headlines that produced "— extract manually —" ===');
// Every case below is a real headline pulled from the live Leads sheet on
// 2026-08-08, where 40 of 193 rows had no company name. Grouped by the reason
// the v2 extractor missed them.
[
  // Accented initial letters: JS \w is ASCII-only, so the name stopped at "Na"
  ['Naïve raises $28.5M Series A to let AI agents run companies', 'Naïve'],
  ['Naïve Raises $28.5 Million Series A To Build Infrastructure For Autonomous Companies', 'Naïve'],
  // Lowercase descriptor sitting between the name and the verb
  ['Naïve startup raises $28.5 million to automate business creation with AI agents', 'Naïve'],
  // Lowercase / uncapitalised descriptor lead-ins
  ['Food delivery startup Amigo raises pre seed round led by Foxhog', 'Amigo'],
  ['Legal AI startup NYAI raises $1.5mn seed round from family offices', 'NYAI'],
  ['Legal tech startup NYAI raises $1.5 Mn in seed round', 'NYAI'],
  ['Web3 startup Bundle launches with $5.5 million pre-Seed round', 'Bundle'],
  ['Startup Paravo Emerges From Stealth Launching AI-Powered Client Management Platform', 'Paravo'],
  ['Enterprise Software Implementation Platform June AI Raises $20 Million Pre-Seed', 'June AI'],
  // Junk prefix in braces
  ['{Funding Alert} Personal Assistance Startup Hulp Raises $2.6 Mn to Fuel Expansion', 'Hulp'],
  // Possessive followed by lowercase prose
  ['Enrola’s pivot to AI sales-tech lands $2.1 million Seed', 'Enrola'],
  // Company named only after a colon
  ['Legacy Bank Cores Cannot Power AI Agents: Maximum Raises $30M to Replace Them', 'Maximum'],
  ['Beyond Real-World Trial Iteration: QuantHealth Secures $45M for AI Clinical Simulation', 'QuantHealth'],
  ['Small Business AI Consultants: BlackCube Labs Launches Free AI Strategy Plan for Founders and SMEs', 'BlackCube Labs'],
  // Verbs the ACTION_WORDS list was missing
  ['Actualyze AI Emerges From Stealth With $7 Mln Seed Round', 'Actualyze AI'],
  ['MIXI Establishes CAIO (Chief AI Officer) Role to Oversee Company-Wide AI Strategy', 'MIXI'],
  ['Innovaccer Showcases Healthcare AI Strategy Focus at Industry Conference', 'Innovaccer'],
  ['Luma Health Emphasizes Workflow Transformation in Healthcare AI Strategy', 'Luma Health'],
  ['Autonomize AI Advances Agentic Healthcare AI Strategy Amid Workplace Recognition', 'Autonomize AI'],
  ['Maven Clinic Reopens Consumer Channel and Pushes AI Strategy in Women’s Digital Health', 'Maven Clinic'],
  // Name trailing a launch verb and a stack of descriptors
  ['Former Swiggy, Zomato executives launch AI startup Profound, raise $1.5 million in seed funding', 'Profound'],
  ['Former Nubank Execs Launch AI-Powered Wealth Advisory Platform Decade With Record $85M Seed Round', 'Decade'],
].forEach(([title, want]) => {
  const got = API.extractCompanyName(title, '');
  ok(got === want, `"${want}" <- ${title.slice(0, 58)}`, got);
});

console.log('\n=== 30. Company extraction: headlines that must stay unnamed ===');
// These name no company at all. Guessing one is worse than leaving the cell
// blank, because the Company column drives the 30-day dedupe key.
[
  'Two LA Startups Raised $2.37B to Build What AI Needs',
  'Your Healthcare AI Strategy Has a Data Problem. And It’s an Interoperability Problem.',
  'Healthcare AI Strategy & Roadmaps',
  'Why Patient Outcomes Must Drive Healthcare AI Strategy',
  'The Healthcare AI Strategy Of China',
  'Health Data News Roundup: Healthcare AI Strategy, AI Care Standard & Medicare',
  'Utah’s latest funding rounds fuel health tech and industry-specific software',
  'Dhivya Nagasubramanian, VP of AI Transformation and Innovation – Interview Series',
].forEach((title) => {
  const got = API.extractCompanyName(title, '');
  ok(got === '', `unnamed: ${title.slice(0, 62)}`, got);
});

console.log('\n=== 31. Descriptor strip must not eat the company ===');
// The strip is a heuristic and over-fires on product names, so extraction
// falls back to the untouched headline. Each of these regressed once.
[
  ['Medi Assist Unveils Upgraded AI-powered Platforms to Advance Cashless Healthcare', 'Medi Assist'],
  ["CIBC launches AI platform to take on advisors' administrative work", 'CIBC'],
  ['Thryv Launches AI-Native Growth Platform for Small Businesses', 'Thryv'],
  ['U Mobile opens Enterprise Innovation Platform Hub to accelerate 5G-A adoption', 'U Mobile'],
  ['Bloom Security launches with $20M to automate SOC triage', 'Bloom Security'],
].forEach(([title, want]) => {
  const got = API.extractCompanyName(title, '');
  ok(got === want, `"${want}" survives the strip`, got);
});


console.log('\n=== 32. backfillCompanyNames() on rows already in the sheet ===');
// 18 columns, per LEAD_HEADERS. Only Company(3), Headline(9), Snippet(10) matter here.
const mkRow = (company, headline, snippet) => {
  const r = new Array(18).fill('');
  r[3] = company; r[9] = headline; r[10] = snippet || '';
  return r;
};
const backfillRows = [
  // v1 row: raw HTML in the headline AND no company
  mkRow('— extract manually —',
        'Keebler Health secures $16M in &lt;b&gt;series A&lt;/b&gt; funding for AI',
        'It&amp;#39;s a risk-adjustment platform'),
  // extractor gap, clean text
  mkRow('— extract manually —', 'Food delivery startup Amigo raises pre seed round led by Foxhog'),
  // genuinely unnameable — must stay as-is
  mkRow('— extract manually —', 'Two LA Startups Raised $2.37B to Build What AI Needs'),
  // a name typed in by hand — must never be overwritten
  mkRow('My Own Note', 'Naïve raises $28.5M Series A to let AI agents run companies'),
  // already correct — must be left alone
  mkRow('Discern Security', 'Discern Security Raises $13 Million Series A'),
];

let bfWrites = 0;
const bfSheet = (rows) => {
  const data = rows.map(r => r.slice());
  return { data,
    getLastRow: () => data.length + 1,
    getLastColumn: () => 18,
    getRange: (sr, sc, nr, nc) => ({
      getValues: () => data.slice(sr - 2, sr - 2 + nr).map(r => r.slice(sc - 1, sc - 1 + nc)),
      setValues: (v) => { bfWrites++; v.forEach((row, i) => row.forEach((cell, j) => {
        data[sr - 2 + i][sc - 1 + j] = cell; })); },
    }) };
};
const sheetA = bfSheet(backfillRows);
const realSheet = H.SHEET;
H.SHEET = { getUrl: () => 'https://sheet', getName: () => 'T', toast: () => {},
            getSheetByName: (n) => (n === 'Leads' ? sheetA : null) };

const bf = API.backfillCompanyNames();
ok(bf.named === 2, 'named the two recoverable rows', bf);
ok(bf.cleaned === 1, 'cleaned the one row with raw HTML', bf);
ok(bfWrites === 1, 'wrote the whole range once, not row by row', bfWrites);
ok(sheetA.data[0][3] === 'Keebler Health', 'company recovered after HTML cleanup', sheetA.data[0][3]);
ok(sheetA.data[0][9].indexOf('<b>') === -1 && sheetA.data[0][9].indexOf('&lt;') === -1,
   'headline HTML stripped in place', sheetA.data[0][9]);
ok(sheetA.data[0][10].indexOf("It's") !== -1, 'snippet entity decoded in place', sheetA.data[0][10]);
ok(sheetA.data[1][3] === 'Amigo', 'extractor gap filled', sheetA.data[1][3]);
ok(sheetA.data[2][3] === '— extract manually —', 'unnameable row left as the placeholder', sheetA.data[2][3]);
ok(sheetA.data[3][3] === 'My Own Note', 'a hand-typed company is never overwritten', sheetA.data[3][3]);
ok(sheetA.data[4][3] === 'Discern Security', 'an already-correct company is untouched', sheetA.data[4][3]);

// Re-running must be a no-op — this is the property that makes it safe to
// re-run after every future extractor change.
const snap = JSON.stringify(sheetA.data);
const sheetB = bfSheet(sheetA.data);
H.SHEET = { getUrl: () => 'https://sheet', getName: () => 'T', toast: () => {},
            getSheetByName: (n) => (n === 'Leads' ? sheetB : null) };
const bf2 = API.backfillCompanyNames();
ok(bf2.named === 0 && bf2.cleaned === 0, 'second run finds nothing left to do', bf2);
ok(JSON.stringify(sheetB.data) === snap, 'second run leaves the data byte-identical');
H.SHEET = realSheet;

console.log('\n=== 33. jobReach_: can we take this job on from India? ===');
// STRUCTURED fields (Remotive / WWR / Jobicy) are an allowlist. The absence of
// a fence is NOT permission — "Americas, Europe, Israel" bars nobody by name
// and still has no door for us.
[['Worldwide',                          'open'],
 ['Anywhere in the World',              'open'],
 ['Asia Only',                          'open'],   // India is in Asia
 ['India',                              'open'],
 ['LATAM, Europe, USA, Canada, APAC',   'open'],   // one token in five is ours
 ['Americas, Europe, Israel',           'fenced'],
 ['North America Only',                 'fenced'],
 ['USA',                                'fenced'],
 ['Europe, UK, Germany',                'fenced'],
 ['EMEA',                               'fenced'],  // Europe/MidEast/Africa: not us
].forEach(([field, want]) => {
  const got = API.jobReach('', field);
  ok(got === want, `structured "${field}" -> ${want}`, got);
});

// FREE TEXT (Hacker News) has no such field, so silence has to read as
// permission — HN posters write "REMOTE" and stop far too often to reject
// them all. Only an explicit fence closes the door.
[['Acme | REMOTE | ML Engineer',                    'unclear'],
 ['Acme | Remote (US only) | ML Engineer',          'fenced'],
 ['Acme | REMOTE (US) | ML Engineer',               'fenced'],
 ['Acme | Remote — US-based | ML Engineer',         'fenced'],
 ['Acme | Remote, EU only | ML Engineer',           'fenced'],
 ['Acme | Remote | must be authorized to work in the US', 'fenced'],
 ['Acme | Remote (US timezones) | ML Engineer',     'fenced'],
 ['Acme | Remote — Worldwide | ML Engineer',        'open'],
 ['Acme | Remote (India) | ML Engineer',            'open'],
 ['Acme | Berlin / Freiburg / NYC | ML Engineer',   'onsite'],
 ['Acme | NYC ONSITE | ML Engineer',                'onsite'],
].forEach(([text, want]) => {
  const got = API.jobReach(text, '');
  ok(got === want, `free text "${text.slice(0, 46)}" -> ${want}`, got);
});

// The fence has to survive the two substrings most likely to misfire.
ok(API.jobReach('Campus based role, remote', '') !== 'fenced',
   '"campus based" is not "US based"', API.jobReach('Campus based role, remote', ''));
ok(API.jobReach('Remote | Building consensus across teams', '') === 'unclear',
   '"consensus" does not trigger the EU fence', API.jobReach('Remote | Building consensus across teams', ''));

console.log('\n=== 34. WeWorkRemotely parser (real feed) ===');
FIXTURES['weworkremotely.com'] = { code: 200, body: fixture('wwr-programming.rss') };
const wwr = API.fetchWeWorkRemotely({ label: 'WWR: Programming', slug: 'remote-programming-jobs', segment: 'saas' });
console.log('  parsed:', wwr.map(w => `${w.company} [${w.locationField}]`).join(', '));
ok(wwr.length >= 3, 'parsed the engineering roles', wwr.length);
ok(wwr.every(w => w.kind === 'job'), 'every item is a job');
const mule = wwr.find(w => w.company === 'Sticker Mule');
ok(!!mule, 'company taken from the "Company: Role" title', wwr.map(w => w.company));
ok(mule && mule.role === 'Software engineer', 'role is the other half of the title', mule && mule.role);
ok(mule && mule.locationField === 'Anywhere in the World', '<region> captured verbatim', mule && mule.locationField);
// The employer's own URL is entity-encoded inside the description. Decoding
// before extracting is what makes the lead outreach-ready rather than a name.
ok(mule && mule.domain === 'stickermule.com', 'employer domain pulled out of the description', mule && mule.domain);

// Proxify AB's "Senior Backend Developer (Python)" used to be filtered out
// here: v2's RELEVANT_JOB_TITLE only admitted AI/ML work. Step 3 widened it to
// Pixler Lab's full stack, so a plain backend role is now exactly the kind of
// lead this feed is for.
ok(wwr.some(w => w.company === 'Proxify AB'),
   'a plain backend role is now admitted (step 3 widening)', wwr.map(w => w.company));
ok(wwr.every(w => !/&lt;|<p>/.test(w.snippet)), 'snippet is decoded and tag-stripped');
ok(!wwr.some(w => /Counsel|Regulatory/i.test(w.role)), 'a legal role is filtered out by RELEVANT_JOB_TITLE',
   wwr.map(w => w.role));

// End to end: the region field decides, and it decides differently per row.
const wwrAsia = wwr.find(w => w.locationField === 'Asia Only');
const wwrNA   = wwr.find(w => w.locationField === 'North America Only');
ok(wwrAsia && API.evaluate(wwrAsia).keep, '"Asia Only" qualifies — that is us', wwrAsia && API.evaluate(wwrAsia).reason);
ok(wwrNA && !API.evaluate(wwrNA).keep, '"North America Only" is dropped', wwrNA && API.evaluate(wwrNA).reason);

console.log('\n=== 35. Jobicy parser ===');
FIXTURES['jobicy.com/api'] = { code: 200, body: JSON.stringify({ jobs: [
  { jobTitle: 'Senior Machine Learning Engineer', companyName: 'Openly', jobGeo: 'Anywhere',
    url: 'https://jobicy.com/j/1', pubDate: new Date().toISOString(), jobExcerpt: 'Own the <b>ML</b> platform' },
  { jobTitle: 'Data Engineer', companyName: 'Northbound', jobGeo: 'Canada, USA',
    url: 'https://jobicy.com/j/2', pubDate: new Date().toISOString(), jobExcerpt: 'Pipelines' },
  { jobTitle: 'Customer Success Manager', companyName: 'Chatty', jobGeo: 'Anywhere',
    url: 'https://jobicy.com/j/3', pubDate: new Date().toISOString(), jobExcerpt: 'Renewals' },
]}) };
const jby = API.fetchJobicy({ label: 'Jobicy: Engineering', industry: 'engineering', segment: 'saas' });
ok(jby.length === 2, 'CSM dropped on title, both engineers kept', jby.map(j => j.role));
ok(!jby[0].snippet.includes('<b>'), 'excerpt tag-stripped');
ok(API.evaluate(jby[0]).keep, '"Anywhere" ML role qualifies');
const jbyFenced = API.evaluate(jby[1]);
ok(!jbyFenced.keep && /out of reach/.test(jbyFenced.reason), '"Canada, USA" is out of reach', jbyFenced.reason);

console.log('\n=== 36. NEWS_GEO is a real switch, not a one-way door ===');
const indianRound = mk('Superleap Raises Rs 36 Cr In Series A Led By Peak XV');
ok(API.evaluate(indianRound).keep, 'global by default');
API.CONFIG.NEWS_GEO = 'us';
const backToUs = API.evaluate(mk('Superleap Raises Rs 36 Cr In Series A Led By Peak XV'));
ok(!backToUs.keep && backToUs.reason.startsWith('non-US'),
   'flipping NEWS_GEO to "us" restores v2 exactly', backToUs.reason);
// ...and the job gate is independent of it: we can still only staff remote work.
const usJobWhileUsMode = { kind: 'job', title: 'ML Engineer at Acme', company: 'Acme', snippet: '',
  url: 'https://x/77', publishedAt: new Date(), sourceLabel: 'j', segmentHint: 'saas',
  locationHint: 'Worldwide', locationField: 'Worldwide', contactTitle: '', publisher: '', domain: '' };
ok(API.evaluate(usJobWhileUsMode).keep, 'the job reach gate does not read NEWS_GEO');
API.CONFIG.NEWS_GEO = 'global';
ok(API.evaluate(indianRound).keep, 'and switching back restores global');


console.log('\n=== 37. Keyword matching is anchored to the leading word edge ===');
// Every one of these fired under the old indexOf scan. They are the measured
// cost of substring matching over 606 live items on 2026-09-02, and each one
// was throwing away or mis-tagging a real lead.
[['ngo',            'ongoing Series B funding',              'WRONG_BUYER rejected a funded startup as a non-profit'],
 ['rs.',            'hiring engineers. remote role',         '21 items read as Indian rupees'],
 ['sar',            'Staff Software Engineer at Samsara',    'Samsara rejected as Saudi'],
 ['apac',           'Capacity raises $54m-plus, eyes deals', 'penalised -3 for being in APAC'],
 ['stock',          'Livestock tech platform Breedr raises €23 million', 'killed as stock coverage'],
 ['ai',             'Acme said it would maintain the platform', 'segment tagged from "said"/"maintain"'],
 ['ml',             'Company unveils HTML and XML tooling',   'segment tagged from "HTML"'],
 ['ios',            'Biosolutions raises $4M',               'segment tagged from "Biosolutions"'],
 ['pos',            'Deposit platform expands',              'segment tagged from "Deposit"'],
 ['retail',         'Curetail Health launches portal',       'segment tagged from "Curetail"'],
].forEach(([kw, text, damage]) => {
  ok(text.toLowerCase().indexOf(kw) !== -1, `precondition: indexOf still finds "${kw}" (${damage})`);
  ok(!API.hasKeyword(text.toLowerCase(), kw), `"${kw}" no longer matches mid-word in "${text.slice(0, 42)}"`);
});

// ...and the leading edge is all we anchor, because these lists depend on
// matching stems. Anchoring the trailing edge too lost 17 "startups" and
// 6 "ml engineers" on the same corpus.
[['startup',        'Ten promising Dublin-based startups to watch'],
 ['ml engineer',    'Engineering managers, ML engineers at Yahoo'],
 ['ai engineer',    'Software + FDE + AI engineers at Balerion AI'],
 ['engineering team','Growing our engineering teams in Q3'],
 ['patient',        'not tested on patient outcomes'],
 ['medical device', 'Most AI medical devices cleared for use'],
].forEach(([kw, text]) => {
  ok(API.hasKeyword(text.toLowerCase(), kw), `"${kw}" still matches its plural in "${text.slice(0, 44)}"`);
});

// Keywords that do not begin with a word character get no \b — asserting one
// would match nothing at all.
ok(API.hasKeyword('raises $8m series a', 'raises $'), '"raises $" still matches');
ok(API.hasKeyword('secures ₹36 crore', 'raises ₹') === false, 'non-word-initial keyword compiles and behaves');
ok(API.hasKeyword('acme raises ₹36 crore', 'raises ₹'), '"raises ₹" matches despite the non-ASCII tail');
ok(API.hasKeyword('deal worth 36 crore in equity', 'crore in'), '"crore in" matches');
ok(API.hasKeyword('the company is u.s.-based', 'u.s.'), '"u.s." matches');
ok(!API.hasKeyword('surplus. it grew', 'u.s.'), '"u.s." does not match inside "surplus."');
ok(!API.hasKeyword('india, remote', ' rs '), 'space-delimited " rs " needs the real spaces');
ok(API.hasKeyword('worth 36 rs today', ' rs '), '" rs " matches when the spaces are there');

// The regex cache must not leak state between two different keywords.
ok(API.keywordRe('ai').source !== API.keywordRe('ml').source, 'cache is keyed per keyword');
ok(API.keywordRe('ai') === API.keywordRe('ai'), 'the same keyword compiles once');

// findKeyword_ returns the offending keyword, which the reject reason prints.
ok(API.findKeyword('this mentions nasdaq listings', API.DISQUALIFY) === 'nasdaq',
   'findKeyword names the keyword that fired', API.findKeyword('this mentions nasdaq listings', API.DISQUALIFY));
ok(API.findKeyword('nothing objectionable here', API.DISQUALIFY) === undefined,
   'findKeyword returns undefined on a clean string');

console.log('\n=== 38. ...and the leads those bugs were destroying now survive ===');
const rescued = [
  ['Indigo Ventures backs AI firm Sarvam in ongoing Series B funding round',
   'was rejected as a non-profit ("ngo" inside "ongoing")'],
  ['Livestock tech platform Breedr raises €23 million to expand globally',
   'was rejected as stock coverage ("stock" inside "livestock")'],
];
rescued.forEach(([title, why]) => {
  const v = API.evaluate(mk(title));
  ok(v.keep, `kept: ${title.slice(0, 52)} — ${why}`, v.reason);
});


console.log('\n=== 39. Segment taxonomy (13 tags, zero points) ===');
const SEGS = Object.keys(API.SEGMENT_KEYWORDS);
ok(SEGS.length === 13, '13 segments declared', SEGS.length);
['ecommerce','ai','startup','mobile','saas','health','fintech','real_estate',
 'logistics','edtech','retail','manufacturing','hospitality'].forEach(seg =>
  ok(SEGS.indexOf(seg) !== -1, `segment "${seg}" exists`));

// THE invariant. classifySegment_ picks the segment with the most keyword hits,
// so a keyword that also matches another keyword in its own list double-counts
// that segment on a single phrase — which is the synonym stacking that made v1
// tag everything `health`. Taken literally the spec reintroduced 27 such pairs:
// "ai" also matches "ai platform", "generative ai", "ai-powered", "agentic ai"…
// and `ai` then beat `health` on "Acme Health raises $18M for its clinical AI
// platform". Every list is now self-disjoint.
let redundant = [];
SEGS.forEach(seg => {
  const kws = API.SEGMENT_KEYWORDS[seg];
  kws.forEach(a => kws.forEach(b => {
    if (a !== b && API.hasKeyword(b, a)) redundant.push(`${seg}: "${a}" also matches "${b}"`);
  }));
});
ok(redundant.length === 0, 'no segment keyword matches another in the same segment', redundant.slice(0, 5));

// Industry beats technology. "AI" and "mobile" describe how a company builds,
// not what business it is in, and they co-occur with every vertical here.
[['Acme Health raises $18M Series A to expand its clinical AI platform', 'health'],
 ['Brightwave is hiring an AI engineer for its B2B SaaS automation platform', 'saas'],
 ['Shopify Plus brand raises $5M to scale its AI-powered online store', 'ecommerce'],
 ['Fintech lending platform launches AI underwriting', 'fintech'],
].forEach(([t, want]) => {
  const got = API.classifySegment(t.toLowerCase(), '');
  ok(got === want, `"${t.slice(0, 46)}" -> ${want}`, got);
});

// ...but a company with no vertical marker is genuinely an AI company.
ok(API.classifySegment('balerion raises $12m to build agentic llm infrastructure', '') === 'ai',
   'no industry marker -> ai', API.classifySegment('balerion raises $12m to build agentic llm infrastructure', ''));
ok(API.classifySegment('acme launches a mobile app built in react native', '') === 'mobile',
   'no industry marker -> mobile', API.classifySegment('acme launches a mobile app built in react native', ''));

// "startup" is the broadest tag and must lose to every real vertical, or it
// wins nearly every funding story in the corpus.
ok(API.classifySegment('early stage startup raises seed round', '') === 'startup',
   'startup wins only when nothing else matches');
ok(API.classifySegment('early stage fintech startup raises seed round', '') === 'fintech',
   'a named vertical beats startup',
   API.classifySegment('early stage fintech startup raises seed round', ''));

// The short tokens are only safe because of section 37's leading-edge anchor.
[['acme said it would maintain the platform', 'ai'],
 ['company unveils html and xml tooling', 'ai'],
 ['deposit platform expands', 'retail'],
 ['curetail health launches portal', 'retail'],
].forEach(([t, mustNotBe]) => {
  ok(API.classifySegment(t, '') !== mustNotBe,
     `"${t.slice(0, 40)}" is not mis-tagged ${mustNotBe}`, API.classifySegment(t, ''));
});

// Segments carry ZERO points — the whole reason they are a separate axis.
// The vertical words go in the SNIPPET, not the title: the title also feeds
// extractCompanyName_, so burying "Acme" in a lowercase run costs the +2
// real-company bonus and would make this pass or fail for the wrong reason.
const segScoreA = API.evaluate(mk('Acme Corp Raises $10M Series A'));
const segScoreB = API.evaluate(mk('Acme Corp Raises $10M Series A',
  'healthcare clinical medtech fintech ecommerce proptech edtech logistics'));
ok(segScoreA.score === segScoreB.score,
   'piling on vertical keywords changes the tag, never the score',
   [segScoreA.score, segScoreB.score, segScoreA.segment, segScoreB.segment]);
ok(segScoreA.segment !== segScoreB.segment, '...and it really did change the tag',
   [segScoreA.segment, segScoreB.segment]);


console.log('\n=== 40. Intent groups: 10 groups, and hiring does not double-score ===');
const IG = API.INTENT_GROUPS;
ok(IG.length === 10, '10 intent groups', IG.length);
[['Funding',4],['AI Hiring',4],['Developer Hiring',4],['Shopify / Ecommerce',4],
 ['AI Initiative',3],['Modernization',3],['Mobile App',3],['New Leadership',3],
 ['Product Launch',2],['Engineering Expansion',2]].forEach(([key,w]) => {
  const g = IG.find(x => x.key === key);
  ok(!!g && g.weight === w, `"${key}" exists at weight ${w}`, g && g.weight);
});

// The load-bearing one. The spec files "AI engineer / ML engineer / LLM
// engineer / data engineer" under Developer Hiring while ALSO keeping AI
// Hiring, both at 4 — one phrase, 8 points, from a single job req. Keeping the
// lists disjoint gets the spec's ten groups without the stacking, and keeps
// the distinction Phase 1 exists to measure.
const aiH = IG.find(g => g.key === 'AI Hiring').kw;
const devH = IG.find(g => g.key === 'Developer Hiring').kw;
const hiringClash = [];
aiH.forEach(a => devH.forEach(b => {
  if (API.hasKeyword(b, a) || API.hasKeyword(a, b)) hiringClash.push(`${a} / ${b}`);
}));
ok(hiringClash.length === 0, 'AI Hiring and Developer Hiring share no keyword', hiringClash);

const mlPost = API.evaluate({ kind: 'job', title: 'Senior ML Engineer at Acme', company: 'Acme',
  snippet: '', url: 'https://x/501', publishedAt: new Date(), sourceLabel: 'j',
  segmentHint: 'saas', locationHint: 'Worldwide', locationField: 'Worldwide',
  contactTitle: '', publisher: '', domain: '' });
ok(mlPost.intents === 'AI Hiring', 'an ML role fires AI Hiring ONLY', mlPost.intents);
const reactPost = API.evaluate({ kind: 'job', title: 'Senior React Native Developer at Acme', company: 'Acme',
  snippet: '', url: 'https://x/502', publishedAt: new Date(), sourceLabel: 'j',
  segmentHint: 'saas', locationHint: 'Worldwide', locationField: 'Worldwide',
  contactTitle: '', publisher: '', domain: '' });
ok(reactPost.intents === 'Developer Hiring', 'a React role fires Developer Hiring ONLY', reactPost.intents);

// Bare funding verbs are NOT keywords — word boundaries cannot fix them.
const fundKw = IG.find(g => g.key === 'Funding').kw;
['raises','raised','seed','investment'].forEach(bare =>
  ok(fundKw.indexOf(bare) === -1, `"${bare}" is deliberately not a Funding keyword`));
ok(!API.evaluate(mk('Regulator raises concerns about AI in hiring')).keep,
   '"raises concerns" is not a funding round',
   API.evaluate(mk('Regulator raises concerns about AI in hiring')).reason);
ok(!API.evaluate(mk('Retailer seeded 40 new stores across the region')).keep,
   '"seeded" is not a seed round');
ok(API.evaluate(mk('Acme Corp raises $8M Series A')).keep, 'a real round still fires');

// Bare launch verbs are gone from Product Launch, per the spec's own
// "avoid overly generic launches". Measured: they were the only thing
// qualifying 33 wire releases, whatever those releases launched.
const plKw = IG.find(g => g.key === 'Product Launch').kw;
['launches','unveils','debuts','rolls out','ai-powered','ai powered','now available']
  .forEach(bare => ok(plKw.indexOf(bare) === -1, `"${bare}" removed from Product Launch`));
ok(!API.evaluate(mk('Bridgeline launches two of five HawkSearch deployments')).keep,
   'a generic launch is no longer a lead');

// ...but §17's canonical GOOD signal must still qualify — via AI Initiative
// at 3, which is where §3 files it, not via a generic verb at 2.
const aiLaunch = API.evaluate(mk('WizCommerce Launches AI-Powered CRM for Distributors'));
ok(aiLaunch.keep, '"launches AI-powered X" is still a lead', aiLaunch.reason);
ok(/AI Initiative/.test(aiLaunch.intents), '...and it fires AI Initiative', aiLaunch.intents);

// Coming out of stealth had no keyword at all despite its own NEWS_QUERY —
// it was riding on bare "launches" and vanished when that went.
const stealth = API.evaluate(mk('Mirror AI Launches Out of Stealth to Help Professionals'));
ok(stealth.keep, 'a stealth exit is a lead', stealth.reason);
ok(/Funding/.test(stealth.intents), '...and it fires Funding', stealth.intents);

// The three deliberate cross-group overlaps. A Shopify replatform is genuinely
// two service lines (ecommerce work AND modernization work), unlike the hiring
// pair which was one event counted twice. Pinned so the 7 stays intentional.
[['Brand X begins a Shopify replatform of its store', ['Shopify / Ecommerce','Modernization']],
 ['Acme starts an app modernization programme',       ['Mobile App','Modernization']],
].forEach(([t, want]) => {
  const got = API.evaluate(mk(t)).intents || '';
  want.forEach(k => ok(got.indexOf(k) !== -1, `"${t.slice(0,40)}" fires ${k}`, got));
});

// A group still fires at most once no matter how many of its keywords hit.
const stackedFunding = API.evaluate(mk('Acme raises $10M Series A seed round funding round venture round'));
ok((stackedFunding.intents.match(/Funding/g) || []).length === 1,
   'Funding fires once however many of its keywords match', stackedFunding.intents);

console.log('\n=== 41. New groups are wired, even where the corpus cannot reach them yet ===');
// Shopify/Ecommerce and Mobile App fired ZERO times on the 606-item corpus —
// there are no ecommerce or mobile NEWS_QUERIES until step 5. That is a
// sourcing gap, not a scoring one, so prove the groups work directly.
[['Brand migrates from WooCommerce to Shopify Plus', 'Shopify / Ecommerce', 'ecommerce'],
 ['Retailer begins an ecommerce replatform',          'Shopify / Ecommerce', 'ecommerce'],
 ['Acme launches mobile app for field technicians',   'Mobile App',          'mobile'],
 // A real company name, not the word "Startup": the title also feeds
 // extractCompanyName_, and without a name the lead loses the +2 and lands
 // on 4 for reasons that have nothing to do with the group under test.
 ['Bolt Labs announces React Native development for its new product', 'Mobile App', 'mobile'],
].forEach(([t, intent, seg]) => {
  const v = API.evaluate(mk(t));
  ok(v.keep, `"${t.slice(0, 44)}" qualifies`, v.reason);
  ok((v.intents || '').indexOf(intent) !== -1, `...fires ${intent}`, v.intents);
  ok(v.segment === seg, `...and tags ${seg}`, v.segment);
});
// Merely naming Shopify earns nothing — the spec is explicit about this.
ok(!API.evaluate(mk('The 10 best Shopify apps for your ecommerce store')).keep,
   'a Shopify listicle is not a lead',
   API.evaluate(mk('The 10 best Shopify apps for your ecommerce store')).reason);


console.log('\n=== 42. RELEVANT_JOB_TITLE covers the whole stack, and only the stack ===');
const JT = API.CONFIG.RELEVANT_JOB_TITLE;

// THE bug this step found. v2 had `full ?stack`, which matches "full stack"
// and "fullstack" but NOT "full-stack" — the spelling almost everyone uses.
// "Backend" had no pattern at all. Between them these were the commonest job
// titles on every remote board.
[['Senior React Full-stack Developer', 'hyphenated full-stack was rejected by `full ?stack`'],
 ['Full-stack Developer',              'same'],
 ['Senior Front-end Engineer',         'hyphenated front-end had no pattern'],
 ['Backend Developer',                 'plain "backend" had no pattern at all'],
 ['Back-end Developer',                'hyphenated back-end had no pattern'],
].forEach(([t, why]) => ok(JT.test(t), `accepted: "${t}"  (${why})`));

// The stack the spec asks for (§11).
['Senior Shopify Developer', 'Laravel Developer', 'PHP Developer (Remote)',
 'Senior Backend Developer (Python)', 'Django Engineer', 'Node.js Engineer',
 'React Native Developer', 'Flutter Developer', 'iOS Developer', 'Android Developer',
 'DevOps Engineer', 'Senior Cloud Engineer', 'Site Reliability Engineer',
 'Web Developer', 'Senior Software Engineer', 'Platform Engineer',
 'AI/ML Engineer', 'Data Engineer', 'Automation Engineer'
].forEach(t => ok(JT.test(t), `stack role accepted: "${t}"`));

// ...and what it must keep out. Bare "engineer" and bare "developer" are
// deliberately NOT patterns — they would readmit every one of these.
['Senior Product Manager', 'Lead Product Manager', 'Product Designer',
 'Senior Product Designer', 'Product Marketing Manager', 'Customer Support Manager',
 'Customer Support Representative I', 'Mechanical Engineer', 'Director, GTM Finance',
 'Medical Licensing Specialist', 'Data Analyst', 'Design Specialist',
 'Director, Email Deliverability', 'Product Content Specialist'
].forEach(t => ok(!JT.test(t), `not our work, still rejected: "${t}"`));

// A widened title filter must not become a geography loophole: reach is a
// separate gate and still applies.
const wideButFenced = API.evaluate({ kind: 'job', title: 'Senior Shopify Developer at Acme',
  company: 'Acme', snippet: '', url: 'https://x/601', publishedAt: new Date(),
  sourceLabel: 'j', segmentHint: 'saas', locationHint: 'North America Only',
  locationField: 'North America Only', contactTitle: '', publisher: '', domain: '' });
ok(!wideButFenced.keep && /out of reach/.test(wideButFenced.reason),
   'a newly-admitted role still has to be reachable from India', wideButFenced.reason);

console.log('\n=== 43. HN_KEYWORDS widened past AI/ML too ===');
const HK = API.CONFIG.HN_KEYWORDS.map(k => new RegExp(k, 'i'));
const hnHit = (t) => HK.some(r => r.test(t));
['Acme | Remote | Senior React Developer | TypeScript',
 'Bolt | Remote | Django and Python backend work',
 'Corp | Remote | Shopify and Laravel engineering',
 'Delta | Remote | full-stack TypeScript, we run DevOps in-house',
].forEach(t => ok(hnHit(t), `HN posting matched: "${t.slice(0, 52)}"`));
// Thread chatter is what should still fall out, and does.
['Applied 2 months ago. No response',
 'What will you do in your first week?',
 'Same here, I sent an application a month ago I believe.',
].forEach(t => ok(!hnHit(t), `HN chatter ignored: "${t.slice(0, 46)}"`));
// The original AI/ML patterns must survive the widening.
['Acme | Remote | LLM Engineer', 'Acme | Remote | MLOps', 'Acme | Remote | machine learning']
  .forEach(t => ok(hnHit(t), `original AI/ML pattern still matches: "${t.slice(0, 40)}"`));


console.log('\n=== 44. Institutions are wrong buyers; vendors named after them are not ===');
// Step 3's wider title filter admitted "Software Engineer", and research
// hospitals and universities arrived with it. They buy through procurement.
[["Sr. Staff Software Engineer at St. Jude Children's Research Hospital", 'research hospital'],
 ['Software Engineer at University of Michigan',                          'university of'],
 ['Backend Developer at Massachusetts General Medical Center',            'medical center'],
 ['Full-stack Developer at the College of Charleston',                    'college of'],
].forEach(([t, kw]) => {
  const hit = API.findKeyword(t.toLowerCase(), API.WRONG_BUYER);
  ok(hit === kw, `"${t.slice(0, 46)}" rejected via "${kw}"`, hit);
});

// The reason these are PHRASES. Bare "hospital" / "university" would reject
// health-tech and edtech vendors, which are among the best leads in the system.
['Backend Developer at HospitalIQ', 'Software Engineer at UniversityNow',
 'Full-stack Developer at Schoolytics', 'Data Engineer at Miltenyi Biotec',
 'React Developer at Healthgrades'
].forEach(t => ok(API.findKeyword(t.toLowerCase(), API.WRONG_BUYER) === undefined,
   `vendor not mistaken for an institution: "${t.slice(0, 46)}"`,
   API.findKeyword(t.toLowerCase(), API.WRONG_BUYER)));

// The original wrong-buyer list still works.
['PCI Federal Names Todd Hughes VP of AI Strategy', 'City of Austin adopts AI',
 'NHS trust deploys automation'
].forEach(t => ok(!API.evaluate(mk(t)).keep, `still rejected: "${t.slice(0, 44)}"`));


console.log('\n=== 45. Columns S/T/U: technology, service, outreach ===');
ok(API.LEAD_HEADERS.length === 21, '21 columns (A–U)', API.LEAD_HEADERS.length);
ok(API.LEAD_HEADERS[18] === 'Technology', 'S = Technology');
ok(API.LEAD_HEADERS[19] === 'Service Opportunity', 'T = Service Opportunity');
ok(API.LEAD_HEADERS[20] === 'Recommended Outreach', 'U = Recommended Outreach');

// APPENDED, never inserted. Everything that reads the sheet by index has to
// keep working, or a migration silently corrupts live rows.
ok(API.LEAD_HEADERS[3]  === 'Company',    'D is still Company (30-day dedupe key)');
ok(API.LEAD_HEADERS[9]  === 'Headline',   'J is still Headline (fingerprint dedupe)');
ok(API.LEAD_HEADERS[11] === 'Source URL', 'L is still Source URL (url dedupe)');
ok(API.LEAD_HEADERS[12] === 'Status',     'M is still Status (data validation range M2:M5000)');
ok(API.LEAD_HEADERS[15] === 'Segment' && API.LEAD_HEADERS[17] === 'Domain',
   'P/R unchanged');

// The spec's own worked examples from §4 and §5, end to end.
[['Brand Co migrates WooCommerce store to Shopify Plus',
  'ecommerce', 'Shopify / Ecommerce', 'Shopify', 'Shopify Development / Migration'],
 ['Newrich Network is hiring a Senior Full Stack Developer - PHP Laravel',
  null, 'Developer Hiring', 'Laravel', 'Laravel Development'],
 ['Acme Corp launches mobile app built with React Native',
  'mobile', 'Mobile App', 'React Native', 'React Native Development'],
 ['Astoria AI raises $8M Series A and is hiring a Founding AI Engineer',
  'ai', 'AI Hiring', 'AI/LLM', 'AI Development / Integration'],
 ['Globex Corp announces legacy application modernization',
  null, 'Modernization', null, 'Software Modernization'],
].forEach(([t, seg, intent, tech, opp]) => {
  const v = API.evaluate(mk(t));
  ok(v.keep, `qualifies: "${t.slice(0, 44)}"`, v.reason);
  if (seg)  ok(v.segment === seg, `  segment ${seg}`, v.segment);
  ok((v.intents || '').indexOf(intent) !== -1, `  intent ${intent}`, v.intents);
  if (tech) ok((v.technology || '').indexOf(tech) !== -1, `  technology ${tech}`, v.technology);
  ok(v.opportunity === opp, `  opportunity ${opp}`, v.opportunity);
  ok(/^\S/.test(v.outreach) && v.outreach.length > 20, '  outreach line is written', v.outreach);
});

// A more specific technology suppresses the broader one it implies, or the
// column reads "React Native, React, Mobile" and tells you nothing.
const rn = API.evaluate(mk('Acme Corp launches mobile app built with React Native'));
ok(rn.technology === 'React Native', 'React Native suppresses React and Mobile', rn.technology);
ok(API.detectTechnology('senior laravel and php developer').indexOf('PHP') === -1,
   'Laravel suppresses PHP', API.detectTechnology('senior laravel and php developer'));
ok(API.detectTechnology('react python node.js laravel shopify ai devops api').length <= 3,
   'at most three technologies reported',
   API.detectTechnology('react python node.js laravel shopify ai devops api'));

// The spec is explicit: do not invent a service with no signal.
ok(API.deriveOpportunity([], '', 'other') === '', 'no signal -> no service claimed');
ok(API.outreachAngle('', [], '') === '', 'no signal -> no outreach line');

// The row must stay exactly as wide as the headers, or setValues() throws.
const wideLead = Object.assign({}, mk('Acme Corp Raises $10M Series A'),
                               API.evaluate(mk('Acme Corp Raises $10M Series A')));
const wideRow = API.buildLeadRow(wideLead);
ok(wideRow.length === API.LEAD_HEADERS.length,
   `row width ${wideRow.length} === headers ${API.LEAD_HEADERS.length}`);
ok(wideRow[12] === 'New', 'Status still defaults to New at index 12');
ok(typeof wideRow[18] === 'string' && typeof wideRow[19] === 'string' &&
   typeof wideRow[20] === 'string', 'S/T/U are always strings, never undefined',
   [wideRow[18], wideRow[19], wideRow[20]]);

// A lead that fires nothing derivable still produces a well-formed row.
const bareRow = API.buildLeadRow({ score: 5, company: 'X', sourceLabel: 's', intents: '',
  title: 't', snippet: '', url: 'u', segment: 'other' });
ok(bareRow.length === API.LEAD_HEADERS.length, 'a row with no derived fields is still full width');
ok(bareRow[18] === '' && bareRow[19] === '' && bareRow[20] === '', 'missing derived fields become ""');


console.log('\n=== 46. Quality-first quota (spec §8) ===');
// The spec has this backwards: it says MIN_PER_SEGMENT forces four leads per
// segment and manufactures weak ones. `cap` is a per-segment CEILING and
// nothing is ever padded.
const noPad = [];
for (let i = 0; i < 40; i++) noPad.push({ segment: 'saas', score: 9, sourceLabel: 's' + (i % 8), title: 't' + i, company: 'c' + i });
noPad.push({ segment: 'fintech', score: 9, sourceLabel: 'sx', title: 'tf', company: 'cf' });
const noPadQ = API.applySegmentQuota(noPad);
ok(!noPadQ.counts.edtech, 'a segment with no leads produces no leads', noPadQ.counts);
ok(noPadQ.counts.fintech === 1, 'a segment with one lead keeps exactly one', noPadQ.counts);

// The REAL defect, which is the inverse: measured against the qualified pool
// the ceiling was 0.6 x 291 = 175 for a 60-lead run, so it never bound and
// `ai` took 42% of every digest unchallenged.
const flood = [];
for (let i = 0; i < 200; i++) flood.push({ segment: 'ai', score: 9, sourceLabel: 's' + (i % 20), title: 'a' + i, company: 'ca' + i });
for (let i = 0; i < 40; i++)  flood.push({ segment: 'saas', score: 8, sourceLabel: 't' + (i % 20), title: 'b' + i, company: 'cb' + i });
const floodQ = API.applySegmentQuota(flood);
const capExpected = Math.ceil(API.CONFIG.MAX_LEADS_PER_RUN * API.CONFIG.MAX_SEGMENT_SHARE);
ok(floodQ.cap === capExpected, `cap is a share of the RUN (${capExpected}), not of the qualified pool`, floodQ.cap);
ok(floodQ.counts.ai <= capExpected, 'one segment can no longer take the whole run', floodQ.counts);
ok(floodQ.counts.saas > 0, '...and the smaller segment still gets in', floodQ.counts);
ok(floodQ.kept.length <= API.CONFIG.MAX_LEADS_PER_RUN, 'run ceiling still respected', floodQ.kept.length);
// Deferred leads are not lost — they are reconsidered next run.
ok(floodQ.deferred.length === flood.length - floodQ.kept.length,
   'every non-kept lead is deferred, never dropped', floodQ.deferred.length);

console.log('\n=== 47. Run Log diagnostics (spec §14) ===');
const statOK = { label: 'GNews: X', fetched: 25, qualified: 4, rejected: 21,
                 reasons: { 'no trigger event': 14, 'disqualified': 5, 'low score': 2 } };
const d = API.statDetail(statOK);
ok(/fetched 25/.test(d) && /qualified 4/.test(d) && /rejected 21/.test(d),
   'detail carries fetched, qualified and rejected', d);
ok(/no trigger event 14/.test(d), 'and the dominant reject reason', d);
ok(d.indexOf('no trigger event') < d.indexOf('disqualified'),
   'reasons are ordered by frequency', d);
ok(API.statDetail({ label: 'x', fetched: 0, qualified: 0, error: 'HTTP 503' }) === 'HTTP 503',
   'an errored source reports its error, not a zero row');
ok(!/rejected/.test(API.statDetail({ label: 'x', fetched: 3, qualified: 3 })),
   'a source that rejected nothing says nothing about rejections');

// The counter must come from evaluate_, not from `fetched - qualified`:
// duplicates never reach evaluate_, so that subtraction blamed the scoring
// for the deduper's work.
const statLive = { label: 'test', fetched: 0, qualified: 0 };
const rejected = mk('The 10 best Shopify apps for your store');
rejected._stat = statLive;
API.evaluate(rejected);
ok(statLive.rejected === 1, 'evaluate_ records the rejection on the source', statLive);
ok(Object.keys(statLive.reasons || {}).length === 1, 'and buckets its reason', statLive.reasons);
const scored1 = mk('Acme Corp raises $8M Series A'); scored1._stat = statLive;
API.evaluate(scored1);
ok(statLive.qualified === 1 && statLive.rejected === 1,
   'qualified and rejected are counted independently', statLive);
// "score 4" and "score 7" are the same finding and must share a bucket.
const s4 = { label: 't', fetched: 0, qualified: 0 };
[mk('Globex begins legacy application modernization'),
 mk('Initech begins cloud migration')].forEach(i => { i._stat = s4; API.evaluate(i); });
ok(Object.keys(s4.reasons || {}).indexOf('low score') !== -1,
   'score rejections bucket together as "low score"', s4.reasons);


console.log(`\n${'='.repeat(60)}`);
console.log(`  ${pass} passed, ${fail} failed`);
console.log(`${'='.repeat(60)}\n`);
process.exit(fail ? 1 : 0);
