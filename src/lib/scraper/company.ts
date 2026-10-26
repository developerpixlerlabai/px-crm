import {
  ACTION_WORDS,
  DESCRIPTOR_WORDS,
  NOT_A_COMPANY,
  PUBLISHERS,
} from "./keywords.ts";
import { cleanText } from "./text.ts";

/**
 * Headlines capitalize their verbs ("Obsidian Security Raises $85 Million"),
 * but the company-name part of a pattern must stay case-SENSITIVE so it only
 * matches proper nouns. One regex can't be half case-insensitive, so each verb
 * is expanded into a [Rr]aises-style class instead of using the /i flag.
 */
export function anyCase(word: string): string {
  return word
    .split("")
    .map((c) => (/[a-z]/.test(c) ? "[" + c.toUpperCase() + c + "]" : c))
    .join("");
}

// Built with anyCase rather than an /i flag on the whole pattern: the flag
// would also make the "(?=[A-Z])" guard case-insensitive, and the strip then
// ate everything up to a lowercase word ("…AI-powered Platforms to Advance"
// left just "to Advance Cashless Healthcare").
const DESCRIPTOR_NOUNS = "(?:" + DESCRIPTOR_WORDS.map(anyCase).join("|") + ")";

const COMPANY_ACTIONS = "(?:" + ACTION_WORDS.map(anyCase).join("|") + ")";

// Accented capitals/letters are included explicitly: JS \w is ASCII-only, so
// "Naïve raises $28.5M" stopped the name at "Na" and matched nothing.
const NAME =
  "([A-Z\\u00C0-\\u00DE][\\w&.'’\\-\\u00C0-\\u00FF]*" +
  "(?:\\s+(?:[A-Z\\u00C0-\\u00DE][\\w&.'’\\-\\u00C0-\\u00FF]*|of|and|the)){0,4})";

// "Naïve startup raises …" — a lowercase descriptor may sit between the name
// and the verb, where stripLeadingDescriptor can't reach it (it only strips
// descriptors that PRECEDE the name).
const OPT_DESC =
  "(?:\\s+(?:" +
  ["startup", "start-up", "company", "platform", "firm"].map(anyCase).join("|") +
  "))?";

const LAUNCH_VERBS = "(?:[Ll]aunch(?:es|ed)?|[Uu]nveil(?:s|ed)?|[Ii]ntroduc(?:e|es|ed))";

const DESCRIPTOR_LEAD_IN = new RegExp(
  "^(?:[\\w&'’.-]+\\s+){0,5}" + DESCRIPTOR_NOUNS + "\\s+(?=[A-Z\\u00C0-\\u00DE])",
);

// "Valencia-based Linkene", "UAE-Based Fortis", "Y Combinator-backed Fizz".
// A place or backer phrase in front of the name is never part of it.
const BASED_LEAD_IN =
  /^(?:[A-Z][\w.&'’]*(?:[ -][A-Z][\w.&'’]*){0,2})[ -](?:based|backed|headquartered)\s+/i;

// "Egyptian Proptech Aqar", "Portuguese EdTech Intuitivo", "Fintech Zaria
// Systems": an optional nationality, then a sector word, then the name.
const SECTOR_LEAD_IN =
  /^(?:[A-Z][a-z]+\s+)?(?:Ed[Tt]ech|Prop[Tt]ech|Fin[Tt]ech|Health[Tt]ech|Insur[Tt]ech|Legal[Tt]ech|Med[Tt]ech|Agri[Tt]ech|Climate[Tt]ech|Travel[- ][Tt]ech)\s+(?=[A-Z])/;

// Words that trail a name in a headline but are not part of it:
// "RapidCanvas Series B", "Aqar Exit".
const TRAILING_NOISE = /\s+(?:Series [A-F]|Exit|Funding|Round|Seed)$/;

const LAUNCHED = new RegExp(LAUNCH_VERBS + "\\s+([^,]{0,70}?)(?=\\s+[Ww]ith\\b|,|$)");

const COMPANY_PATTERNS = [
  new RegExp("^" + NAME + OPT_DESC + "\\s+" + COMPANY_ACTIONS + "\\b"),
  new RegExp("^" + NAME + ",\\s+(?:a|an|the|which)\\s+"),
  new RegExp(
    "^" + NAME + "\\s+(?:" + ["has", "is", "to", "will"].map(anyCase).join("|") +
      ")\\s+" + COMPANY_ACTIONS,
  ),
  new RegExp(
    "^" + NAME + "\\s+(?:" + anyCase("series") + "\\s+[A-D]|" + anyCase("funding") +
      "|" + anyCase("round") + ")\\b",
  ),
  // "Enrola’s pivot to AI sales-tech lands $2.1 million Seed" — possessive
  // followed by lowercase prose, so the stripLeadingDescriptor rule (which
  // requires a capital after the apostrophe) never fires.
  new RegExp("^" + NAME + "['’]s\\s+[\\w\\s.,'’-]{0,45}?\\s+" + COMPANY_ACTIONS + "\\b"),
];

const BARE_NAME = new RegExp("^" + NAME + "\\s*$");

/**
 * Strips descriptive lead-ins so the extractor lands on the actual company:
 * "Enterprise AI Startup Superleap Raises...", "UAE Startup Bundle Raises...",
 * "Bulgaria's Estel Technologies raises..." all produced the descriptor.
 */
export function stripLeadingDescriptor(t: string): string {
  return (
    String(t || "")
      // "{Funding Alert} Personal Assistance Startup Hulp ..." -> "Personal ..."
      .replace(/^\s*[{[(][^}\])]{0,40}[}\])]\s*/, "")
      // "Bulgaria's Estel Technologies ..." -> "Estel Technologies ..."
      .replace(/^[A-Z][\w.&-]*['’]s\s+(?=[A-Z])/, "")
      // "Valencia-based Linkene ..." -> "Linkene ..."
      .replace(BASED_LEAD_IN, "")
      // "Egyptian Proptech Aqar ..." -> "Aqar ..."
      .replace(SECTOR_LEAD_IN, "")
      // "Enterprise AI Startup Superleap ..." -> "Superleap ..." Not restricted
      // to Capitalised lead-ins: "Food delivery startup Amigo" is lowercase.
      .replace(DESCRIPTOR_LEAD_IN, "")
      .trim()
  );
}

/**
 * Pulls the company out of a headline, or "" when the headline never names one
 * ("Two LA Startups Raised $2.37B to Build What AI Needs").
 *
 * Three passes, cheapest first. The direct patterns must run before the
 * launch-verb pass, or "Bloom Security launches with $20M" would be read as a
 * product launch and lose the company sitting at the front.
 */
export function extractCompanyName(title: string, publisher: string): string {
  const base = stripPublisherSuffix(cleanText(title), publisher);
  const t = stripLeadingDescriptor(base);

  // Stripped first ("Personal Assistance Startup Hulp Raises" must yield Hulp),
  // then the original — the strip over-fires on product names like
  // "…Innovation Platform Hub", where the company still leads the headline.
  const direct = matchCompanyPatterns(t) || matchCompanyPatterns(base);
  if (direct) return direct;

  // "Former Nubank Execs Launch AI-Powered Wealth Advisory Platform Decade
  //  With Record $85M Seed Round" — the name trails a launch verb and a pile
  //  of descriptors, so re-run the descriptor strip on just that fragment.
  const launched = t.match(LAUNCHED);
  if (launched) {
    const fromLaunch = matchCompanyPatterns(stripLeadingDescriptor(launched[1]), true);
    if (fromLaunch) return fromLaunch;
  }

  // "Beyond Real-World Trial Iteration: QuantHealth Secures $45M" — a themed
  // clause first, the company after the colon.
  const colon = t.indexOf(": ");
  if (colon > 0 && colon < t.length - 3) {
    const after = matchCompanyPatterns(stripLeadingDescriptor(t.slice(colon + 2)));
    if (after) return after;
  }

  return "";
}

/**
 * @param bare  Accept a leading proper noun on its own. Only safe for a
 *              fragment already isolated by a launch verb — on a whole headline
 *              it would name every article's first word.
 */
function matchCompanyPatterns(t: string, bare = false): string {
  const patterns = bare ? [...COMPANY_PATTERNS, BARE_NAME] : COMPANY_PATTERNS;
  for (const pattern of patterns) {
    const m = t.match(pattern);
    const name = m ? m[1].trim().replace(TRAILING_NOISE, "") : "";
    if (name && isRealCompany(name)) return name;
  }
  return "";
}

/** Rejects publications, generic words, and junk from the Company column. */
export function isRealCompany(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = String(name).trim();
  if (n.length < 2 || n.length > 60) return false;
  if (n.indexOf("extract manually") !== -1) return false;

  const lower = n.toLowerCase();
  if (PUBLISHERS.some((p) => lower.indexOf(p) !== -1)) return false;
  if (NOT_A_COMPANY.indexOf(lower) !== -1) return false;

  // "Two LA Startups Raised $2.37B" — a category headline yields a name ending
  // in the category noun. A real company never does ("Labs"/"Ventures" are kept
  // out of that list precisely because they DO end real names).
  if (DESCRIPTOR_WORDS.indexOf(lower.split(/\s+/).pop() ?? "") !== -1) return false;
  // A single lowercase word is almost never a company name here
  if (!/[A-Z]/.test(n)) return false;
  return true;
}

/** Removes Google News' trailing " - Publisher" from a headline. */
export function stripPublisherSuffix(title: string, publisher: string): string {
  const t = String(title || "").trim();
  if (publisher) {
    const suffix = " - " + publisher;
    if (t.length > suffix.length && t.slice(-suffix.length) === suffix) {
      return t.slice(0, -suffix.length).trim();
    }
  }
  // Fallback: drop a short trailing " - Something" segment
  const m = t.match(/^(.*)\s-\s([^-]{2,30})$/);
  if (m && PUBLISHERS.some((p) => m[2].toLowerCase().indexOf(p) !== -1)) return m[1].trim();
  return t;
}
