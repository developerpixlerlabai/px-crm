import "server-only";

import {
  decodeEntities,
  extractBody,
  getHeader,
  getThread,
  hasAttachment,
  listLabels,
  listLabelledThreadIds,
  parseAddress,
  type GmailMessage,
} from "@/lib/google/gmail";
import {
  resolveReadableMailbox,
  resolveReadableMailboxes,
} from "@/lib/google/mailboxes";
import { sanitizeEmailHtml } from "@/lib/mail/sanitize";

/**
 * Reading the in-scope corpus.
 *
 * Everything here goes through `resolveReadableMailbox(es)`, which returns
 * nothing for a mailbox still awaiting its label choice — so a gated account is
 * never read, and never even has a token minted for it.
 */

/** Threads pulled per mailbox for the list view. Keeps one request bounded. */
const THREADS_PER_MAILBOX = 25;

/** Concurrent thread fetches. Gmail's per-user quota is generous, but not free. */
const CONCURRENCY = 5;

export type ThreadSummary = {
  threadId: string;
  mailboxId: string;
  mailboxAddress: string;
  subject: string;
  /** Display name of the other party — what Gmail shows in the list. */
  counterpartyName: string;
  counterparty: string;
  snippet: string;
  lastMessageAt: string | null;
  messageCount: number;
  lastFromMe: boolean;
  unread: boolean;
  starred: boolean;
  hasAttachment: boolean;
  /** The thread's own Gmail labels, for the rail's per-label filtering. */
  labelIds: string[];
};

export type ThreadMessage = {
  id: string;
  fromName: string;
  from: string;
  to: string;
  subject: string;
  sentAt: string | null;
  /** Sanitised. Safe to place in a shadow root; never trusted as raw provider HTML. */
  bodyHtml: string | null;
  /** The trailing quoted reply, split out so the reader can collapse it. */
  quotedHtml: string | null;
  hasBlockedImages: boolean;
  hasAttachment: boolean;
  direction: "inbound" | "outbound";
};

export type ThreadDetail = {
  threadId: string;
  mailboxId: string;
  mailboxAddress: string;
  subject: string;
  messages: ThreadMessage[];
};

/** Runs `task` over `items`, at most `limit` at a time. */
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    out.push(...(await Promise.all(items.slice(i, i + limit).map(task))));
  }
  return out;
}

/** Epoch millis as a STRING — not seconds, not ISO. */
function sentAtOf(message: GmailMessage): string | null {
  return message.internalDate
    ? new Date(Number(message.internalDate)).toISOString()
    : null;
}

function summarise(
  messages: GmailMessage[],
  threadId: string,
  mailboxId: string,
  mailboxAddress: string,
): ThreadSummary | null {
  if (messages.length === 0) return null;

  const newest = messages[messages.length - 1];
  const first = messages[0];
  const headers = newest.payload?.headers;
  const address = mailboxAddress.toLowerCase();

  const from = parseAddress(getHeader(headers, "From") ?? "");
  const to = parseAddress(getHeader(headers, "To") ?? "");
  const fromMe = from.address === address;
  const other = fromMe ? to : from;

  // Gmail tracks read state and stars as labels on the message itself.
  const allLabels = new Set(messages.flatMap((m) => m.labelIds ?? []));

  return {
    threadId,
    mailboxId,
    mailboxAddress,
    subject:
      getHeader(first.payload?.headers, "Subject")?.trim() || "(no subject)",
    counterpartyName: other.name,
    counterparty: other.address ?? "unknown",
    // Gmail's snippet is HTML-escaped text; raw, it shows `&lt;a@b.com&gt;`.
    snippet: decodeEntities(newest.snippet ?? ""),
    lastMessageAt: sentAtOf(newest),
    messageCount: messages.length,
    lastFromMe: fromMe,
    unread: allLabels.has("UNREAD"),
    starred: allLabels.has("STARRED"),
    hasAttachment: messages.some((m) => hasAttachment(m.payload)),
    labelIds: [...allLabels],
  };
}

/**
 * Splits a body into the new part and the quoted history.
 *
 * Without this a three-message thread shows the same text three times, because
 * every reply carries its predecessor inside it. Gmail hides that behind a
 * toggle, so the reader needs the two halves separately.
 *
 * Deliberately conservative: only the markers mail clients actually emit, and
 * only when the split leaves real content behind.
 */
function splitQuoted(html: string): { body: string; quoted: string | null } {
  const markers = [
    /<div[^>]*class="[^"]*gmail_quote[^"]*"[\s\S]*$/i,
    /<blockquote[^>]*class="[^"]*gmail_quote[^"]*"[\s\S]*$/i,
    /<div[^>]*id="(?:appendonsend|divRplyFwdMsg)"[\s\S]*$/i,
    /<hr[^>]*id="stopSpelling"[\s\S]*$/i,
  ];

  for (const marker of markers) {
    const match = html.match(marker);
    if (!match?.index) continue;

    const body = html.slice(0, match.index);
    // A split that leaves nothing readable is worse than no split at all.
    if (body.replace(/<[^>]*>/g, "").trim().length === 0) continue;

    return { body, quoted: html.slice(match.index) };
  }

  return { body: html, quoted: null };
}

/**
 * Every in-scope thread across every readable mailbox, newest first.
 *
 * `threads.list` returns only ids, so each thread needs a `threads.get` to reach
 * its headers. That is the cost of not maintaining a local mirror — see Phase 2.
 */
export async function listScopedThreads(): Promise<{
  threads: ThreadSummary[];
  /** Gmail label id → name, for the rail. */
  labels: Record<string, string>;
  mailboxCount: number;
}> {
  const readable = await resolveReadableMailboxes();

  const perMailbox = await Promise.all(
    readable.map(async ({ mailbox, labelIds, accessToken }) => {
      // One labels.list per mailbox, so the rail can show names rather than ids.
      const names: Record<string, string> = {};
      try {
        for (const label of await listLabels(accessToken)) {
          if (labelIds.includes(label.id)) names[label.id] = label.name;
        }
      } catch {
        // Names are a nicety; ids still filter correctly without them.
      }

      const ids = (await listLabelledThreadIds(accessToken, labelIds)).slice(
        0,
        THREADS_PER_MAILBOX,
      );

      const summaries = await mapLimit(ids, CONCURRENCY, async (threadId) => {
        try {
          const thread = await getThread(accessToken, threadId);
          return summarise(
            thread.messages ?? [],
            threadId,
            mailbox.id,
            mailbox.address,
          );
        } catch {
          // One unreadable thread must not empty the whole list.
          return null;
        }
      });

      return {
        names,
        threads: summaries.filter((s): s is ThreadSummary => s !== null),
      };
    }),
  );

  const threads = perMailbox
    .flatMap((m) => m.threads)
    .sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));

  return {
    threads,
    labels: Object.assign({}, ...perMailbox.map((m) => m.names)),
    mailboxCount: readable.length,
  };
}

/** One thread in full, with sanitised bodies. Null when not readable. */
export async function getScopedThread(
  mailboxId: string,
  threadId: string,
): Promise<ThreadDetail | null> {
  const readable = await resolveReadableMailbox(mailboxId);
  if (!readable) return null;

  const { mailbox, labelIds, accessToken } = readable;
  const thread = await getThread(accessToken, threadId);
  const messages = thread.messages ?? [];

  // Do not serve a thread just because its id was guessed: it must actually carry
  // one of the labels this mailbox is scoped to.
  const inScope = messages.some((m) =>
    (m.labelIds ?? []).some((id) => labelIds.includes(id)),
  );
  if (!inScope) return null;

  const address = mailbox.address.toLowerCase();

  return {
    threadId,
    mailboxId: mailbox.id,
    mailboxAddress: mailbox.address,
    subject:
      getHeader(messages[0]?.payload?.headers, "Subject")?.trim() ||
      "(no subject)",
    messages: messages.map((message) => {
      const headers = message.payload?.headers;
      const from = parseAddress(getHeader(headers, "From") ?? "");
      const to = parseAddress(getHeader(headers, "To") ?? "");

      const raw = extractBody(message.payload);
      const split = raw ? splitQuoted(raw) : null;

      const body = sanitizeEmailHtml(split?.body ?? null);
      const quoted = sanitizeEmailHtml(split?.quoted ?? null);

      return {
        id: message.id ?? "",
        fromName: from.name,
        from: from.address ?? "unknown",
        to: to.address ?? "",
        subject: getHeader(headers, "Subject")?.trim() ?? "",
        sentAt: sentAtOf(message),
        bodyHtml: body?.html ?? null,
        quotedHtml: quoted?.html ?? null,
        hasBlockedImages:
          Boolean(body?.hasBlockedImages) || Boolean(quoted?.hasBlockedImages),
        hasAttachment: hasAttachment(message.payload),
        direction: from.address === address ? ("outbound" as const) : ("inbound" as const),
      };
    }),
  };
}
