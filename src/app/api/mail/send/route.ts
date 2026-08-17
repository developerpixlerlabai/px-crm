import { NextResponse } from "next/server";

import { GmailApiError, sendMessage } from "@/lib/google/gmail";
import {
  MailboxError,
  accessTokenForMailbox,
  getMailbox,
} from "@/lib/google/mailboxes";
import { GoogleOAuthError } from "@/lib/google/oauth";
import { canSend, needsSyncScopeConsent } from "@/lib/google/types";

type SendBody = {
  mailboxId?: string;
  to?: string;
  subject?: string;
  body?: string;
  /** Present for a reply — keeps it in the thread the label already covers. */
  threadId?: string;
  inReplyTo?: string;
};

/**
 * Sends mail as a connected mailbox.
 *
 * The sent copy is tagged with the mailbox's synced labels where Gmail allows it,
 * so outbound mail stays inside the same scope the CRM reads. A reply carries
 * `threadId` and inherits its thread's label regardless.
 */
export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => null)) as SendBody | null;

    const mailboxId = payload?.mailboxId?.trim();
    const to = payload?.to?.trim();
    const subject = payload?.subject?.trim() ?? "";
    const body = payload?.body ?? "";

    if (!mailboxId || !to) {
      return NextResponse.json(
        { error: "Provide mailboxId and a recipient." },
        { status: 400 },
      );
    }
    if (!to.includes("@")) {
      return NextResponse.json({ error: `"${to}" is not an email address.` }, { status: 400 });
    }
    if (!subject && !body.trim()) {
      return NextResponse.json(
        { error: "Write a subject or a message before sending." },
        { status: 400 },
      );
    }

    const mailbox = await getMailbox(mailboxId);
    if (!mailbox) {
      return NextResponse.json({ error: "Mailbox not found." }, { status: 404 });
    }
    if (mailbox.status !== "connected") {
      return NextResponse.json(
        { error: "That mailbox is not connected." },
        { status: 409 },
      );
    }

    // Capability check before the API call, so the user gets an actionable message
    // rather than a raw 403 from Google.
    if (!canSend(mailbox)) {
      return NextResponse.json(
        {
          error:
            "This mailbox was connected before send permission was requested. " +
            "Reconnect it to send from here.",
          needsReconnect: true,
        },
        { status: 403 },
      );
    }

    // A gated mailbox has not been told what it may touch. Sending through it
    // would put mail into a scope nobody has chosen yet.
    if (needsSyncScopeConsent(mailbox)) {
      return NextResponse.json(
        { error: "Choose which labels this mailbox syncs before sending from it." },
        { status: 409 },
      );
    }

    const accessToken = await accessTokenForMailbox(mailboxId);

    const sent = await sendMessage(accessToken, {
      from: mailbox.address,
      to,
      subject,
      body,
      threadId: payload?.threadId,
      inReplyTo: payload?.inReplyTo,
      labelIds: mailbox.syncedLabelIds ?? undefined,
    });

    // Report back whether the label actually stuck. On a brand-new thread Gmail
    // may ignore labelIds and force SENT only, which would leave outbound mail
    // outside the CRM's scope — the caller should surface that rather than hide it.
    const applied = sent.labelIds ?? [];
    const scoped = (mailbox.syncedLabelIds ?? []).some((id) => applied.includes(id));

    return NextResponse.json({
      id: sent.id,
      threadId: sent.threadId,
      labelIds: applied,
      inScope: scoped || Boolean(payload?.threadId),
    });
  } catch (err) {
    if (err instanceof GmailApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof MailboxError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof GoogleOAuthError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    console.error("[api/mail/send]", err);
    return NextResponse.json({ error: "Unexpected error sending mail." }, { status: 500 });
  }
}
