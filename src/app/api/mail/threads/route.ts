import { NextResponse } from "next/server";

import { GmailApiError } from "@/lib/google/gmail";
import { MailboxError } from "@/lib/google/mailboxes";
import { GoogleOAuthError } from "@/lib/google/oauth";
import { isSupabaseConfigured } from "@/lib/supabase/service";
import { listScopedThreads } from "@/lib/mail/threads";

/** The in-scope thread list — only mail carrying a chosen label. */
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ threads: [], mailboxCount: 0 });
  }

  try {
    return NextResponse.json(await listScopedThreads());
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
    console.error("[api/mail/threads]", err);
    return NextResponse.json(
      { error: "Unexpected error reading mail." },
      { status: 500 },
    );
  }
}
