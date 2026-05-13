import { NextRequest, NextResponse } from "next/server";

const AUTH_REALM = "Gecko Cam";
const PUBLIC_PATHS = ["/favicon", "/icon"];

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

function getBasicAuthPassword(authorization: string | null): string | null {
  if (!authorization?.startsWith("Basic ")) return null;

  try {
    const decoded = atob(authorization.slice(6));
    const separator = decoded.indexOf(":");
    if (separator === -1) return null;
    return decoded.slice(separator + 1);
  } catch {
    return null;
  }
}

function unauthorized(request: NextRequest) {
  const headers = new Headers({
    "WWW-Authenticate": `Basic realm="${AUTH_REALM}", charset="UTF-8"`,
  });

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers,
  });
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
  const basicPassword = getBasicAuthPassword(request.headers.get("authorization"));

  if ((expectedToken && cookieToken === expectedToken) || basicPassword === sitePassword) {
    return NextResponse.next();
  }

  return unauthorized(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
