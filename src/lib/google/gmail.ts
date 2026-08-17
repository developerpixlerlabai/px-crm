import "server-only";

import type { GmailLabel } from "@/lib/google/types";

/**
 * Gmail REST, same plain-`fetch` idiom as `oauth.ts` and `sheets.ts`.
 *
 * Every function takes an access token rather than a mailbox id: minting the
 * token is `accessTokenForMailbox()`'s job, and keeping that seam separate is
 * what lets these be tested with a fixed token.
 */

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

/** Pages per label on a threads.list sweep, so one request stays bounded. */
const MAX_PAGES_PER_LABEL = 5;
const PAGE_SIZE = 100;

export class GmailApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GmailApiError";
    this.status = status;
  }
}

async function call<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });

  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;

  if (!res.ok) {
    const message =
      (body as { error?: { message?: string } } | null)?.error?.message ??
      `HTTP ${res.status}`;
    throw new GmailApiError(message, res.status);
  }

  return body as T;
}

// ─── Labels ──────────────────────────────────────────────────────────────────

type RawLabel = { id?: string; name?: string; type?: string };

/**
 * Every label, user-created ones first.
 *
 * Covered by `gmail.readonly` — listing needs no extra scope, which is why the
 * picker works before a mailbox has been reconnected for label creation.
 */
export async function listLabels(accessToken: string): Promise<GmailLabel[]> {
  const data = await call<{ labels?: RawLabel[] }>(accessToken, "/labels");

  const labels = (data.labels ?? [])
    .filter((l): l is RawLabel & { id: string; name: string } =>
      Boolean(l.id && l.name),
    )
    .map((l) => ({
      id: l.id,
      name: l.name,
      type: l.type === "user" ? ("user" as const) : ("system" as const),
    }));

  // User labels first, each group alphabetical — the ones a person made are the
  // ones they are looking for.
  return labels.sort((a, b) => {
    if (a.type !== b.type) return a.type === "user" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** Creates a label. Requires `gmail.labels`, so a read-only grant gets a 403. */
export async function createLabel(
  accessToken: string,
  name: string,
): Promise<GmailLabel> {
  const trimmed = name.trim();
  if (!trimmed) throw new GmailApiError("Give the label a name.", 400);

  try {
    const created = await call<RawLabel>(accessToken, "/labels", {
      method: "POST",
      body: JSON.stringify({
        name: trimmed,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      }),
    });

    if (!created.id) throw new GmailApiError("Gmail returned no label id.", 502);
    return { id: created.id, name: created.name ?? trimmed, type: "user" };
  } catch (err) {
    if (err instanceof GmailApiError) {
      // Translate the two failures a user can actually act on.
      if (err.status === 409) {
        throw new GmailApiError(
          `A label named "${trimmed}" already exists in Gmail.`,
          409,
        );
      }
      if (err.status === 403) {
        throw new GmailApiError(
          "This mailbox was connected without label permission. Reconnect it to " +
            "create labels from here.",
          403,
        );
      }
    }
    throw err;
  }
}

// ─── Threads ─────────────────────────────────────────────────────────────────

/**
 * Thread ids carrying ANY of the given labels.
 *
 * ONE REQUEST PER LABEL, unioned through a Set. Gmail ANDs a multi-element
 * `labelIds`, so asking for ['CRM1','Crm2'] in a single call matches only threads
 * carrying both — in practice almost nothing. This fails silently as "no mail
 * found", which is exactly why it is a loop and not a single call.
 *
 * Threads rather than messages: a thread matches when any of its messages carries
 * the label, which is Gmail's own semantics — and the reason a reply that Gmail
 * never labelled still stays in scope.
 */
export async function listLabelledThreadIds(
  accessToken: string,
  labelIds: readonly string[],
): Promise<string[]> {
  const ids = new Set<string>();

  for (const labelId of labelIds) {
    let pageToken: string | undefined;
    let pages = 0;

    do {
      const params = new URLSearchParams({
        labelIds: labelId, // single element, always
        maxResults: String(PAGE_SIZE),
      });
      if (pageToken) params.set("pageToken", pageToken);

      const data = await call<{
        threads?: { id?: string }[];
        nextPageToken?: string;
      }>(accessToken, `/threads?${params.toString()}`);

      for (const thread of data.threads ?? []) {
        if (thread.id) ids.add(thread.id);
      }

      pageToken = data.nextPageToken;
      pages += 1;
    } while (pageToken && pages < MAX_PAGES_PER_LABEL);
  }

  return [...ids];
}

export type GmailMessage = {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: MessagePart;
};

export type MessagePart = {
  mimeType?: string;
  filename?: string;
  headers?: { name?: string; value?: string }[];
  body?: { data?: string };
  parts?: MessagePart[];
};

/**
 * A whole thread with fully-populated messages, so there is no follow-up
 * messages.get per message.
 */
export async function getThread(
  accessToken: string,
  threadId: string,
): Promise<{ id?: string; messages?: GmailMessage[] }> {
  return call(accessToken, `/threads/${threadId}?format=full`);
}

// ─── Sending ─────────────────────────────────────────────────────────────────

export type SendOptions = {
  from: string;
  to: string;
  subject: string;
  body: string;
  /** Set for a reply, so Gmail files it into the existing thread. */
  threadId?: string;
  /** The Message-ID header of the message being replied to. */
  inReplyTo?: string;
  /**
   * Labels to apply to the sent copy.
   *
   * Gmail MAY ignore this on send and force SENT only — see the experiment in
   * docs/GMAIL-SYNC.md. Passing it costs nothing and, if honoured, avoids
   * needing the RESTRICTED gmail.modify scope entirely.
   */
  labelIds?: readonly string[];
};

/**
 * Builds an RFC 2822 message and sends it.
 *
 * A reply needs `threadId` AND the `In-Reply-To`/`References` headers: threadId
 * alone makes Gmail's own UI thread it, but other mail clients thread on the
 * headers, so a reply without them starts a new conversation for the recipient.
 */
export async function sendMessage(
  accessToken: string,
  options: SendOptions,
): Promise<{ id?: string; threadId?: string; labelIds?: string[] }> {
  const headers = [
    `From: ${options.from}`,
    `To: ${options.to}`,
    `Subject: ${encodeHeader(options.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
  ];

  if (options.inReplyTo) {
    headers.push(`In-Reply-To: ${options.inReplyTo}`);
    headers.push(`References: ${options.inReplyTo}`);
  }

  const mime = `${headers.join("\r\n")}\r\n\r\n${options.body}`;

  return call(accessToken, "/messages/send", {
    method: "POST",
    body: JSON.stringify({
      raw: toBase64Url(mime),
      ...(options.threadId ? { threadId: options.threadId } : {}),
      ...(options.labelIds?.length ? { labelIds: [...options.labelIds] } : {}),
    }),
  });
}

/**
 * RFC 2047 encoding, but only when needed.
 *
 * A raw non-ASCII subject is invalid in a header and arrives as mojibake.
 */
function encodeHeader(value: string): string {
  const collapsed = value.replace(/[\r\n]+/g, " ").trim();

  const isAscii = [...collapsed].every((char) => (char.codePointAt(0) ?? 0) <= 0x7f);
  if (isAscii) return collapsed;

  return `=?UTF-8?B?${Buffer.from(collapsed, "utf-8").toString("base64")}?=`;
}

/** Gmail expects base64url: `-`/`_`, and no padding. */
export function toBase64Url(value: string): string {
  return Buffer.from(value, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Gmail bodies are base64url too — plain base64 decoding produces garbage. */
export function decodeBase64Url(data: string): string {
  return Buffer.from(
    data.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  ).toString("utf-8");
}

export function getHeader(
  headers: MessagePart["headers"],
  name: string,
): string | null {
  const match = headers?.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase(),
  );
  return match?.value ?? null;
}

/** MIME is a tree: recurse, prefer HTML, fall back to plain text. */
export function extractBody(part: MessagePart | undefined): string | null {
  return findPart(part, "text/html") ?? findPart(part, "text/plain");
}

function findPart(part: MessagePart | undefined, mimeType: string): string | null {
  if (!part) return null;
  if (part.mimeType === mimeType && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }
  for (const child of part.parts ?? []) {
    const found = findPart(child, mimeType);
    if (found) return found;
  }
  return null;
}

/** `"Jane Doe <jane@example.com>"` → `"jane@example.com"` */
export function extractEmail(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const angled = trimmed.match(/<([^>]+)>/);
  const candidate = angled ? angled[1] : trimmed;
  return candidate.includes("@") ? candidate.trim().toLowerCase() : null;
}

/**
 * `"kuljeet singh <k@x.com>"` → `{ name: "kuljeet singh", address: "k@x.com" }`
 *
 * Falls back to the address's local part when the header carries no display name,
 * which is what Gmail shows in that case. A mail list of raw addresses reads
 * nothing like a mailbox.
 */
export function parseAddress(raw: string): { name: string; address: string | null } {
  const trimmed = raw.trim();
  const address = extractEmail(trimmed);

  const angled = trimmed.match(/^(.*)<[^>]+>\s*$/);
  const display = angled?.[1]?.trim().replace(/^"(.*)"$/, "$1").trim();

  if (display) return { name: display, address };
  if (address) return { name: address.split("@")[0], address };
  return { name: trimmed || "unknown", address: null };
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Gmail's `snippet` is HTML-ESCAPED text, not markup.
 *
 * Render it raw and every quoted reply shows `&lt;someone@example.com&gt;`
 * literally. Decoding here is safe because the result is handed to React as a
 * text child, which escapes it again on output — it never reaches innerHTML.
 */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    const lower = entity.toLowerCase();

    if (lower.startsWith("#x")) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (lower.startsWith("#")) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[lower] ?? match;
  });
}

/** True when any part of the message tree is a real attachment. */
export function hasAttachment(part: MessagePart | undefined): boolean {
  if (!part) return false;
  if (part.filename && part.filename.trim().length > 0) return true;
  return (part.parts ?? []).some(hasAttachment);
}
