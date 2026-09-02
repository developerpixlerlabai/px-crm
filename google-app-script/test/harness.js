// Loads the real ../Code.gs and runs it in Node behind minimal Apps Script
// stubs, so the parsing and scoring logic can be tested against real feed data.
//
// Set LIVE=1 to make UrlFetchApp hit the network for real (used by live.js);
// otherwise fetches are served from the FIXTURES map.
const fs = require('fs');
const nodePath = require('path');

// Overridable so a test can A/B the real file against a patched copy of it
// (used to prove a scoring change is a no-op before it ships).
const CODE_PATH = process.env.CODE_PATH || nodePath.join(__dirname, '..', 'Code.gs');
const SRC = fs.readFileSync(CODE_PATH, 'utf8');

// ── Minimal XML parser (stack-based) good enough for RSS 2.0 + Atom ──
function parseXml(str) {
  str = str.replace(/<\?xml[^>]*\?>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const root = { name: '#root', children: [], text: '', attrs: {} };
  const stack = [root];
  const re = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<!\[CDATA\[([\s\S]*?)\]\]>|([^<]+)/g;
  let m;
  while ((m = re.exec(str))) {
    const [, close, name, attrStr, selfClose, cdata, text] = m;
    const top = stack[stack.length - 1];
    if (cdata !== undefined) { top.text += cdata; continue; }
    if (text !== undefined) { top.text += text; continue; }
    if (close) {
      while (stack.length > 1 && stack[stack.length - 1].name !== name) stack.pop();
      if (stack.length > 1) stack.pop();
      continue;
    }
    const attrs = {};
    (attrStr || '').replace(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
      (_, k, v1, v2) => { attrs[k] = v1 !== undefined ? v1 : v2; return ''; });
    const el = { name, children: [], text: '', attrs };
    top.children.push(el);
    if (!selfClose) stack.push(el);
  }
  return root;
}

function wrap(el) {
  if (!el) return null;
  return {
    _el: el,
    getName: () => el.name,
    getText: () => el.text,
    getChild: (n) => { const c = el.children.find(c => c.name === n || c.name.split(':').pop() === n); return c ? wrap(c) : null; },
    getChildren: (n) => el.children.filter(c => !n || c.name === n || c.name.split(':').pop() === n).map(wrap),
    getChildText: (n) => { const c = el.children.find(c => c.name === n || c.name.split(':').pop() === n); return c ? c.text : null; },
    getAttribute: (n) => (el.attrs[n] !== undefined ? { getValue: () => el.attrs[n] } : null),
  };
}

// ── Stubs ──
const FIXTURES = {};   // url-substring -> {code, body}
const FETCH_LOG = [];

const stubs = {
  Logger: { log: (...a) => LOGS.push(a.join(' ')) },
  XmlService: {
    parse: (s) => ({ getRootElement: () => wrap(parseXml(s).children[0]) }),
    getNamespace: () => ({ _ns: true }),
  },
  UrlFetchApp: {
    // Mirrors the real API: one call, N responses, same order as the requests.
    fetchAll: (requests) => {
      module.exports.BATCHES.push(requests.length);
      if (module.exports.FETCHALL_THROWS) throw new Error('simulated fetchAll outage');
      return requests.map(r => stubs.UrlFetchApp.fetch(r.url, r));
    },
    fetch: (url, opts) => {
      FETCH_LOG.push(url);
      if (process.env.LIVE) {
        // Real synchronous HTTP so we can measure actual live volume.
        const { execFileSync } = require('child_process');
        const args = ['-sS', '-L', '--max-time', '45', '-w', '\n__CODE__%{http_code}',
                      '-A', 'Mozilla/5.0 (compatible; PixlerLab-IntentScraper/2.0)', url];
        let out = '';
        try { out = execFileSync('curl', args, { maxBuffer: 64 * 1024 * 1024 }).toString(); }
        catch (e) { return { getResponseCode: () => 599, getContentText: () => '' }; }
        const i = out.lastIndexOf('\n__CODE__');
        const code = parseInt(out.slice(i + 9), 10) || 599;
        return { getResponseCode: () => code, getContentText: () => out.slice(0, i) };
      }
      const key = Object.keys(FIXTURES).find(k => url.includes(k));
      if (!key) return { getResponseCode: () => 599, getContentText: () => '' };
      const f = FIXTURES[key];
      return { getResponseCode: () => f.code, getContentText: () => f.body };
    },
  },
  SpreadsheetApp: {
    // SHEET is swappable so tests can simulate an unbound standalone project
    getActiveSpreadsheet: () => module.exports.SHEET,
    getUi: () => { module.exports.UI_CALLS.push('getUi'); throw new Error('no ui'); },
    // No-op: there is no write buffer behind the fake sheet.
    flush: () => {},
  },
  GmailApp: { sendEmail: (...a) => { MAILS.push(a); } },
  ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({}) },
};
const LOGS = [];
const MAILS = [];

// `const` declarations at the top level of a Function body stay local to it,
// so Code.gs is evaluated with an explicit export list appended.
const EXPORTS = new Function(...Object.keys(stubs),
  SRC + `
  ;return {
    CONFIG, INTENT_GROUPS, SEGMENT_KEYWORDS, DISQUALIFY, STOCK_PUBLISHERS,
    PUBLISHERS, NOT_A_COMPANY, LEAD_HEADERS, PENALTIES, ENTRY_POINTS,
    WRONG_BUYER, NON_US_HARD, NON_US_SOFT, US_MARKERS,
    // Helpers are private in Apps Script (trailing _) so they stay out of the
    // editor's Run dropdown. Exported here under stable keys for the tests.
    cleanText:            cleanText_,
    normalizeUrl:         normalizeUrl_,
    fingerprint:          fingerprint_,
    hostOf:               hostOf_,
    parseDate:            parseDate_,
    stripPublisherSuffix: stripPublisherSuffix_,
    stripLeadingDescriptor: stripLeadingDescriptor_,
    extractCompanyName:   extractCompanyName_,
    parseHnCompany:       parseHnCompany_,
    isRealCompany:        isRealCompany_,
    anyCase:              anyCase_,
    classifySegment:      classifySegment_,
    detectTechnology:     detectTechnology_,
    deriveOpportunity:    deriveOpportunity_,
    outreachAngle:        outreachAngle_,
    TECHNOLOGIES, OUTREACH_ANGLES,
    hasKeyword:           hasKeyword_,
    findKeyword:          findKeyword_,
    keywordRe:            keywordRe_,
    evaluate:             evaluate_,
    applySegmentQuota:    applySegmentQuota_,
    statDetail:           statDetail_,
    scoreLabel:           scoreLabel_,
    buildLeadRow:         buildLeadRow_,
    unwrapGoogleRedirect: unwrapGoogleRedirect_,
    parseRss2Text:        parseRss2Text_,
    parseAtomText:        parseAtomText_,
    googleNewsUrl:        googleNewsUrl_,
    bingNewsUrl:          bingNewsUrl_,
    fetchBatch:           fetchBatch_,
    startClock:           startClock_,
    sendDailyDigest:      sendDailyDigest_,
    digestLeadRow:        digestLeadRow_,
    digestPlainText:      digestPlainText_,
    fmtDate:              fmtDate_,
    parseHnPosting:       parseHnPosting_,
    isGenericHost:        isGenericHost_,
    escapeHtml:           escapeHtml_,
    fetchGoogleNews:      fetchGoogleNews_,
    fetchBingNews:        fetchBingNews_,
    fetchAtomAlert:       fetchAtomAlert_,
    fetchHackerNewsHiring: fetchHackerNewsHiring_,
    fetchRemotive:        fetchRemotive_,
    fetchWeWorkRemotely:  fetchWeWorkRemotely_,
    fetchJobicy:          fetchJobicy_,
    jobReach:             jobReach_,
    REGION_INCLUDES_INDIA, JOB_FENCED_RE, JOB_OPEN_RE, JOB_REMOTE_RE,
    collectAll:           collectAll_,
    getOrCreateSheet:     getOrCreateSheet_,
    getSpreadsheet_:      getSpreadsheet_,
    safeAlert:            safeAlert_,
    backfillCompanyNames: backfillCompanyNames,
  };`
)(...Object.values(stubs));

const TOASTS = [];
const FAKE_SHEET = {
  getUrl: () => 'https://sheet',
  getSheetByName: (n) => ({ _name: n, getLastRow: () => 1, appendRow: () => {} }),
  toast: (msg, title, secs) => { TOASTS.push({ msg, title, secs }); },
  getName: () => 'Test Sheet',
};

module.exports = {
  API: EXPORTS,
  SHEET: FAKE_SHEET,          // set to null to simulate a standalone project
  TOASTS,
  UI_CALLS: [],
  BATCHES: [],            // sizes of each fetchAll() batch
  FETCHALL_THROWS: false, // flip on to exercise the sequential fallback
  FAKE_SHEET,
  FIXTURES, FETCH_LOG, LOGS, MAILS,
  CODE_PATH,
  FIXTURE_DIR: nodePath.join(__dirname, 'fixtures'),
};
