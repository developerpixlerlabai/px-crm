import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { GmailApiError, listLabelledThreadIds } from "@/lib/google/gmail";
import {
  MailboxError,
  resolveReadableMailbox,
  updateSyncedLabels,
} from "@/lib/google/mailboxes";
import { GoogleOAuthError } from "@/lib/google/oauth";

/** Saves which labels a mailbox may read. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const body = (await request.json().catch(() => null)) as
      | { syncedLabelIds?: unknown }
      | null;

    const raw = body?.syncedLabelIds;
    if (!Array.isArray(raw)) {
      return NextResponse.json(
        { error: "Provide syncedLabelIds as an array of Gmail label ids." },
        { status: 400 },
      );
    }

    const labelIds = [
      ...new Set(raw.filter((v): v is string => typeof v === "string" && v.length > 0)),
    ];

    const mailbox = await updateSyncedLabels(id, labelIds);

    // The header count and badges are server-rendered on the dashboard.
    revalidatePath("/");

    // Confirm the selection did something, rather than leaving the user to guess.
    // Best-effort: a failed count must not make a successful save look broken.
    let threadsInScope: number | null = null;
    try {
      const readable = await resolveReadableMailbox(id);
      if (readable) {
        threadsInScope = (
          await listLabelledThreadIds(readable.accessToken, readable.labelIds)
        ).length;
      }
    } catch (err) {
      console.error("[api/mailboxes/:id] in-scope count failed", err);
    }

    return NextResponse.json({ mailbox, threadsInScope });
  } catch (err) {
    if (err instanceof MailboxError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof GmailApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof GoogleOAuthError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    console.error("[api/mailboxes/:id]", err);
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
