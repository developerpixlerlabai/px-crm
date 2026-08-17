import { NextResponse } from "next/server";

import { GmailApiError, createLabel, listLabels } from "@/lib/google/gmail";
import { MailboxError, accessTokenForMailbox, getMailbox } from "@/lib/google/mailboxes";
import { GoogleOAuthError } from "@/lib/google/oauth";
import { canManageLabels } from "@/lib/google/types";

/**
 * The label picker's API.
 *
 * Note these routes deliberately do NOT go through `resolveReadableMailbox`: they
 * must work while a mailbox is still gated, otherwise there would be no way to
 * ever choose its labels.
 */

function errorResponse(err: unknown) {
  if (err instanceof GmailApiError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof MailboxError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof GoogleOAuthError) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
  console.error("[api/mailboxes/labels]", err);
  return NextResponse.json({ error: "Unexpected error talking to Gmail." }, { status: 500 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const accessToken = await accessTokenForMailbox(id);
    return NextResponse.json({ labels: await listLabels(accessToken) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const body = (await request.json().catch(() => null)) as { name?: string } | null;
    const name = body?.name?.trim();
    if (!name) {
      return NextResponse.json({ error: "Give the label a name." }, { status: 400 });
    }

    // Check the granted scope before calling Google, so the user gets "reconnect
    // this mailbox" rather than a raw 403 from the API.
    const mailbox = await getMailbox(id);
    if (!mailbox) {
      return NextResponse.json({ error: "Mailbox not found." }, { status: 404 });
    }
    if (!canManageLabels(mailbox)) {
      return NextResponse.json(
        {
          error:
            "This mailbox was connected before label permission was requested. " +
            "Reconnect it to create labels from here.",
          needsReconnect: true,
        },
        { status: 403 },
      );
    }

    const accessToken = await accessTokenForMailbox(id);
    return NextResponse.json({ label: await createLabel(accessToken, name) });
  } catch (err) {
    return errorResponse(err);
  }
}
