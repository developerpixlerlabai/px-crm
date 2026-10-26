import { CONFIG } from "./config.ts";
import { escapeHtml, fmtDate } from "./text.ts";
import type { Candidate, Quota, SourceStat } from "./types.ts";

export type Digest = { subject: string; text: string; html: string; fromName: string };

// No emoji anywhere in this HTML: astral-plane characters (U+1F525 and friends)
// arrived mangled — "HOT (8+)" rendered as a row of diamonds. 2-3 byte
// characters like · and — are fine.
const P = {
  bg: "#0f0f0d",
  card: "#171714",
  line: "#26261f",
  text: "#e8e8e0",
  dim: "#8a8a80",
  faint: "#5a5a52",
  green: "#00e5a0",
  hot: "#ff6b3d",
  warm: "#6b8cff",
  cool: "#7a8a99",
};

/**
 * The daily digest, as subject + plain text + HTML.
 *
 * Table-based layout on purpose: Gmail strips `display:flex`, so a flex header
 * row silently collapsed. Tables render identically in Gmail, Outlook and
 * Apple Mail. `appUrl` is the CRM; without it the links to it are left out.
 */
export function buildDigest(
  leads: Candidate[],
  quota: Quota,
  stats: SourceStat[],
  appUrl: string,
  now = new Date(),
): Digest {
  const hot = leads.filter((l) => l.score >= 8);
  const warm = leads.filter((l) => l.score >= 6 && l.score < 8);
  const cool = leads.filter((l) => l.score < 6);

  const shown = leads.slice(0, CONFIG.DIGEST_MAX_LEADS);
  const hidden = leads.length - shown.length;

  const mix = Object.keys(quota.counts)
    .sort((a, b) => quota.counts[b] - quota.counts[a])
    .map((k) => `${quota.counts[k]} ${k}`)
    .join(" / ");

  const badSources = stats.filter((s) => s.fetched === 0 || s.error);

  let html = `<div style="background:${P.bg};padding:28px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" align="center" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;margin:0 auto;background:${P.bg};">

  <tr><td style="padding:0 0 22px;">
    <div style="font-size:10px;color:${P.faint};letter-spacing:2.5px;text-transform:uppercase;padding-bottom:10px;">
      ${escapeHtml(CONFIG.AGENCY_NAME)} &middot; Intent Signals
    </div>
    <div style="font-size:30px;font-weight:700;color:#fff;letter-spacing:-0.8px;line-height:1.15;">
      ${hot.length} hot ${hot.length === 1 ? "lead" : "leads"}
    </div>
    <div style="font-size:13px;color:${P.dim};padding-top:8px;line-height:1.6;">
      ${escapeHtml(fmtDate(now))} &middot; ${leads.length} new total${
        warm.length ? ` &middot; ${warm.length} warm` : ""
      }${cool.length ? ` &middot; ${cool.length} cool` : ""}<br>
      <span style="color:${P.green};">${escapeHtml(mix)}</span>${
        quota.deferred.length
          ? `<span style="color:${P.faint};"> &middot; ${quota.deferred.length} queued for tomorrow</span>`
          : ""
      }
    </div>
  </td></tr>
`;

  if (appUrl) {
    html += `
  <tr><td style="padding:0 0 20px;">
    <a href="${escapeHtml(appUrl)}" style="display:inline-block;background:${P.green};color:#06251a;font-size:13px;font-weight:600;text-decoration:none;padding:11px 20px;border-radius:3px;">
      Open the CRM
    </a>
  </td></tr>
`;
  }

  html += section("Hot &middot; score 8+", shown.filter((l) => l.score >= 8), P.hot);
  html += section("Warm &middot; score 6-7", shown.filter((l) => l.score >= 6 && l.score < 8), P.warm);
  html += section("Cool &middot; score 5", shown.filter((l) => l.score < 6), P.cool);

  if (hidden > 0) {
    const more = `+ ${hidden} more ${hidden === 1 ? "lead" : "leads"} in the CRM`;
    html += `  <tr><td style="padding:4px 0 0;">
    ${
      appUrl
        ? `<a href="${escapeHtml(appUrl)}" style="font-size:12px;color:${P.dim};text-decoration:none;">${more} &rarr;</a>`
        : `<span style="font-size:12px;color:${P.dim};">${more}</span>`
    }
  </td></tr>
`;
  }

  // Dead sources go in the email itself, so a silent failure is caught the
  // morning it happens rather than months later.
  if (badSources.length) {
    html += `  <tr><td style="padding:24px 0 0;border-top:1px solid ${P.line};">
    <div style="font-size:10px;color:#e8b40a;letter-spacing:2px;text-transform:uppercase;padding:16px 0 8px;">
      ${badSources.length} source${badSources.length === 1 ? "" : "s"} returned nothing
    </div>
    <div style="font-size:12px;color:${P.dim};line-height:1.8;">
      ${badSources
        .map(
          (s) =>
            escapeHtml(s.label) + " &mdash; " +
            escapeHtml(s.error ? s.error.substring(0, 70) : "empty"),
        )
        .join("<br>")}
    </div>
  </td></tr>
`;
  }

  html += `  <tr><td style="padding:22px 0 0;border-top:1px solid ${P.line};">
    <div style="font-size:11px;color:${P.faint};line-height:1.7;padding-top:14px;">
      Leads with Status = "New" need action today.<br>
      Scores: 8+ act now &middot; 6-7 worth a look &middot; 5 keep an eye on.
    </div>
  </td></tr>

</table>
</div>`;

  return {
    subject: `${hot.length} hot leads, ${leads.length} new — ${CONFIG.AGENCY_NAME}`,
    text: plainText(leads, hot, mix, appUrl, now),
    html,
    fromName: CONFIG.AGENCY_NAME + " Intent Signals",
  };
}

/** One priority group of lead cards. "" when the group is empty. */
function section(title: string, list: Candidate[], accent: string): string {
  if (!list.length) return "";

  let h = `  <tr><td style="padding:18px 0 10px;">
    <div style="font-size:10px;color:${accent};letter-spacing:2.5px;text-transform:uppercase;font-weight:600;">
      ${title} &middot; ${list.length}
    </div>
  </td></tr>
`;
  list.forEach((l) => (h += leadCard(l, accent)));
  return h;
}

/** A single lead card. Nested tables, not flexbox, so it survives Gmail. */
function leadCard(lead: Candidate, accent: string): string {
  const company =
    lead.company && lead.company.indexOf("extract manually") === -1
      ? lead.company
      : "(company not parsed)";

  // Escape each PART, then join with the separator entity. Joining first turned
  // "&middot;" into a literal "&amp;middot;". Truncation happens before
  // escaping, so it can't slice an entity in half.
  const SEP = ' <span style="color:' + P.faint + ';">&middot;</span> ';
  const trim = (t: string | undefined, n: number) => escapeHtml(String(t || "").substring(0, n));

  // Jobs carry structured role/location/salary; news carries a headline. Fall
  // back to the raw post when a poster ignored the pipe convention.
  let detail: string;
  if (lead.kind === "job") {
    const parts = [lead.role, lead.location, lead.salary].filter(Boolean);
    detail = parts.length
      ? parts.map((p) => trim(p, 60)).join(SEP)
      : trim(lead.snippet || lead.title, 150);
  } else {
    detail = trim(lead.title, 150);
  }

  const chips = [lead.segment, lead.intents]
    .filter(Boolean)
    .map((c) => trim(c, 60))
    .join(SEP);

  const links = [
    `<a href="${escapeHtml(lead.url)}" style="color:${accent};text-decoration:none;">Source</a>`,
  ];
  if (lead.domain) {
    links.push(
      `<a href="https://${escapeHtml(lead.domain)}" style="color:${P.green};text-decoration:none;">${escapeHtml(lead.domain)}</a>`,
    );
  }
  if (company !== "(company not parsed)") {
    // Straight into finding a human to contact — the actual next action.
    links.push(
      `<a href="https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(company)}" style="color:${P.dim};text-decoration:none;">Find contacts</a>`,
    );
  }

  return `  <tr><td style="padding:0 0 8px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${P.card};border-left:3px solid ${accent};">
      <tr><td style="padding:14px 16px;">

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="font-size:15px;font-weight:700;color:#fff;line-height:1.3;">
              ${escapeHtml(company)}
            </td>
            <td align="right" width="52" style="font-size:12px;font-weight:700;color:${accent};white-space:nowrap;vertical-align:top;">
              ${lead.score}<span style="color:${P.faint};font-weight:400;">/10</span>
            </td>
          </tr>
        </table>

        <div style="font-size:13px;color:${P.text};line-height:1.5;padding:7px 0 0;">
          ${detail}
        </div>

        <div style="font-size:10px;color:${P.faint};text-transform:uppercase;letter-spacing:1.2px;padding:9px 0 0;">
          ${chips}
        </div>

        <div style="font-size:12px;padding:10px 0 0;">
          ${links.join(`<span style="color:${P.line};"> &nbsp;|&nbsp; </span>`)}
        </div>

      </td></tr>
    </table>
  </td></tr>
`;
}

/** Plain-text alternative — what watches, notifications and screen readers get. */
function plainText(
  leads: Candidate[],
  hot: Candidate[],
  mix: string,
  appUrl: string,
  now: Date,
): string {
  const lines = [`${hot.length} hot leads, ${leads.length} new total`, `${fmtDate(now)} · ${mix}`, ""];
  if (appUrl) lines.push(appUrl, "");

  leads.slice(0, CONFIG.DIGEST_MAX_LEADS).forEach((l) => {
    const company = l.company && l.company.indexOf("extract manually") === -1 ? l.company : "?";
    const detail =
      l.kind === "job" ? [l.role, l.location, l.salary].filter(Boolean).join(" · ") : l.title;
    lines.push(`[${l.score}/10] ${company} — ${String(detail || "").substring(0, 110)}`);
    lines.push(`         ${l.url}`);
  });
  if (leads.length > CONFIG.DIGEST_MAX_LEADS) {
    lines.push("", `+ ${leads.length - CONFIG.DIGEST_MAX_LEADS} more in the CRM.`);
  }
  return lines.join("\n");
}
