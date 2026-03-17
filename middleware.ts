import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";

const PUBLIC_PATHS = ["/login", "/api/"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

function makeToken(password: string, secret: string): string {
  return createHmac("sha256", secret).update(password).digest("hex");
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  const sitePassword = process.env.SITE_PASSWORD;
  const secret = process.env.API_SECRET;

  // If no password is configured, allow through
  if (!sitePassword || !secret) return NextResponse.next();

  const expectedToken = makeToken(sitePassword, secret);
  const cookieToken = request.cookies.get("gecko_session")?.value;

  if (cookieToken === expectedToken) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
