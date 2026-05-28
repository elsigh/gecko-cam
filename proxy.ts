import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/favicon", "/icon", "/login", "/api/login"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
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

function unauthorized(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set(
    "from",
    `${request.nextUrl.pathname}${request.nextUrl.search}`
  );
  return NextResponse.redirect(loginUrl);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  const sitePassword = process.env.SITE_PASSWORD;
  const secret = process.env.API_SECRET;

  if (!sitePassword) return NextResponse.next();

  const apiSecret = request.headers.get("x-api-secret");
  if (secret && apiSecret === secret) return NextResponse.next();

  const expectedToken = secret ? await makeToken(sitePassword, secret) : null;
  const cookieToken = request.cookies.get("gecko_session")?.value;

  if (expectedToken && cookieToken === expectedToken) {
    return NextResponse.next();
  }

  return unauthorized(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
