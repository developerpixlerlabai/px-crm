import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, isValidSession } from "@/lib/auth/session";

/** The only route an anonymous visitor may reach. */
const LOGIN_PATH = "/login";

/**
 * The shared-password wall. Everything except the login screen itself requires
 * a valid session cookie.
 *
 * Renamed from `middleware.ts` in Next 16; it runs on the Node.js runtime, which
 * is why `node:crypto` in the session module is importable from here.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const signedIn = isValidSession(request.cookies.get(SESSION_COOKIE)?.value);

  if (signedIn) {
    // Without this the login form stays reachable while signed in, which reads
    // as "you are logged out" to anyone who bookmarked it.
    if (pathname === LOGIN_PATH) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

  if (pathname === LOGIN_PATH) return NextResponse.next();

  // The dashboard talks to /api/* with fetch. Sending it an HTML redirect there
  // produces a JSON parse error in the client; a 401 produces a real message.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const url = new URL(LOGIN_PATH, request.url);
  if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  // Static assets and the favicon are excluded — gating them would only break
  // the styling of the login page the visitor is being sent to.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
