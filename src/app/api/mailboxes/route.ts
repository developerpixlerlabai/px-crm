import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { MailboxError, disconnectMailbox, listMailboxes } from "@/lib/google/mailboxes";
import { SupabaseConfigError, isSupabaseConfigured } from "@/lib/supabase/service";

/**
 * The dialog's own API. Mirrors the shape of `/api/leads`: the browser talks to
 * this, and only the server talks to Supabase or Google.
 */

function errorResponse(err: unknown) {
  if (err instanceof MailboxError || err instanceof SupabaseConfigError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("[api/mailboxes]", err);
  return NextResponse.json(
    { error: "Unexpected error loading mailboxes." },
    { status: 500 },
  );
}

export async function GET() {
  // Not configured is a normal state here, not an error: the dashboard should
  // render with an empty list and a hint rather than a red toast.
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ mailboxes: [], configured: false });
  }

  try {
    const mailboxes = await listMailboxes();
    return NextResponse.json({ mailboxes, configured: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { id?: string } | null;
    const id = body?.id?.trim();

    if (!id) {
      return NextResponse.json(
        { error: "Provide the id of the mailbox to disconnect." },
        { status: 400 },
      );
    }

    await disconnectMailbox(id);

    // Keep the server-rendered header count honest after a disconnect.
    revalidatePath("/");

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
