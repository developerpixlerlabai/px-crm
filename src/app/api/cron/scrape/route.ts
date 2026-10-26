import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { runScrape } from "@/lib/scraper/run";

/**
 * The daily scrape, called by .github/workflows/scrape.yml (or any scheduler).
 *
 *   GET /api/cron/scrape            run, save leads, send the digest
 *   GET /api/cron/scrape?dry=1      fetch and score only; saves and sends nothing
 *
 * Exempt from the login wall in proxy.ts; it authenticates with
 * `Authorization: Bearer $CRON_SECRET` instead.
 */

// A run fetches ~40 sources concurrently and usually finishes well under a
// minute; this is headroom for a slow feed, on hosts that honour it.
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not set." }, { status: 503 });
  }
  if (!authorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dry") === "1";

  try {
    return NextResponse.json(await runScrape({ dryRun }));
  } catch (err) {
    console.error("[api/cron/scrape]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "The scrape failed." },
      { status: 500 },
    );
  }
}

function authorized(header: string | null, secret: string): boolean {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
