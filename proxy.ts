import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/login", "/api/armed", "/api/events", "/api/upload-token", "/icon", "/favicon"];
const PUBLIC_EVENT_ROUTE = /^\/events\/[^/]+(?:\/opengraph-image)?$/;

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || PUBLIC_EVENT_ROUTE.test(pathname);
}

async function makeToken(password: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(password));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  const sitePassword = process.env.SITE_PASSWORD;
  const secret = process.env.API_SECRET;

  if (!sitePassword || !secret) return NextResponse.next();

  const expectedToken = await makeToken(sitePassword, secret);
  const cookieToken = request.cookies.get("gecko_session")?.value;

  if (cookieToken === expectedToken) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const proxyConfig = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
