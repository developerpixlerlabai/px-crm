import { NextResponse } from "next/server";

import { GmailApiError } from "@/lib/google/gmail";
import { MailboxError } from "@/lib/google/mailboxes";
import { GoogleOAuthError } from "@/lib/google/oauth";
import { getScopedThread } from "@/lib/mail/threads";

/** One thread in full. 404s for anything outside the mailbox's label scope. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  try {
    const { threadId } = await params;
    const mailboxId = new URL(request.url).searchParams.get("mailboxId");

    if (!mailboxId) {
      return NextResponse.json(
        { error: "Provide mailboxId — a thread id alone does not say whose it is." },
        { status: 400 },
      );
    }

    const thread = await getScopedThread(mailboxId, threadId);
    if (!thread) {
      // Same answer whether the thread does not exist, the mailbox is gated, or
      // the thread is outside its labels: none of those should be distinguishable.
      return NextResponse.json(
        { error: "That conversation is not in this mailbox's synced labels." },
        { status: 404 },
      );
    }

    return NextResponse.json({ thread });
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
    console.error("[api/mail/threads/:id]", err);
    return NextResponse.json(
      { error: "Unexpected error reading the conversation." },
      { status: 500 },
    );
  }
}
