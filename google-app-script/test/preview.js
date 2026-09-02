// Renders the digest from REAL live leads and writes it to an HTML file,
// so the email layout can be eyeballed without sending anything.
process.env.LIVE = '1';
const fs = require('fs');
const H = require('./harness.js');
const { API } = H;

const stats = [];
const items = API.collectAll(stats);
const seenU = new Set(), seenP = new Set(), seenC = new Set();
const kept = [];
items.forEach(i => {
  const nu = API.normalizeUrl(i.url);
  if (!i.url || seenU.has(nu)) return;
  const fp = i.kind === 'job' ? '' : API.fingerprint(i.title);
  if (fp && seenP.has(fp)) return;
  const v = API.evaluate(i);
  if (!v.keep) return;
  if (v.companyKey && seenC.has(v.companyKey)) return;
  if (fp) seenP.add(fp); seenU.add(nu);
  if (v.companyKey) seenC.add(v.companyKey);
  kept.push(Object.assign({}, i, v));
});
kept.sort((a, b) => b.score - a.score);
const quota = API.applySegmentQuota(kept);

H.MAILS.length = 0;
API.sendDailyDigest(quota.kept, quota, stats);
const [to, subject, plain, opts] = H.MAILS[0];

fs.writeFileSync('digest-preview.html', opts.htmlBody);
console.log('subject : ' + subject);
console.log('to      : ' + to);
console.log('from    : ' + opts.name);
console.log('html    : ' + opts.htmlBody.length + ' bytes -> test/digest-preview.html');
console.log('\n--- plain-text alternative (first 14 lines) ---');
console.log(plain.split('\n').slice(0, 14).join('\n'));

// Structural checks that matter for email clients
const h = opts.htmlBody;
const bal = (t) => (h.match(new RegExp('<' + t + '\\b', 'g')) || []).length ===
                   (h.match(new RegExp('</' + t + '>', 'g')) || []).length;
console.log('\n--- checks ---');
console.log('  tables balanced      : ' + bal('table'));
console.log('  <tr> balanced        : ' + bal('tr'));
console.log('  <td> balanced        : ' + bal('td'));
console.log('  no display:flex      : ' + !/display\s*:\s*flex/.test(h));
console.log('  no astral chars      : ' + ![...h].some(c => c.codePointAt(0) > 0xFFFF));
console.log('  no external requests : ' + !/(src|@import)\s*=?\s*["']?https?:/.test(h));
console.log('  cards rendered       : ' + (h.match(/border-left:3px solid/g) || []).length);
