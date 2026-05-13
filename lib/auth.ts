import { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

function secureEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function createSessionToken(password: string, secret: string): string {
  return createHmac("sha256", secret).update(password).digest("hex");
}

export function getBasicAuthPassword(authorization: string | null | undefined): string | null {
  if (!authorization?.startsWith("Basic ")) return null;

  try {
    const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator === -1) return null;
    return decoded.slice(separator + 1);
  } catch {
    return null;
  }
}

export function validateBasicAuthHeader(authorization: string | null | undefined): boolean {
  const sitePassword = process.env.SITE_PASSWORD;
  if (!sitePassword) return true;

  const password = getBasicAuthPassword(authorization);
  if (!password) return false;

  return secureEqual(password, sitePassword);
}

export function validateApiSecret(request: NextRequest): boolean {
  const secret = request.headers.get("x-api-secret");
  const expected = process.env.API_SECRET;

  if (!expected) {
    console.error("API_SECRET env var not set");
    return false;
  }

  if (!secret) return false;
  return secureEqual(secret, expected);
}

export function validateSessionToken(cookie: string | undefined): boolean {
  const sitePassword = process.env.SITE_PASSWORD;
  const secret = process.env.API_SECRET;
  if (!sitePassword) return true;
  if (!secret || !cookie) return false;

  return secureEqual(cookie, createSessionToken(sitePassword, secret));
}

export function validateUserAuthValues(
  cookie: string | undefined,
  authorization: string | null | undefined
): boolean {
  return validateSessionToken(cookie) || validateBasicAuthHeader(authorization);
}

export function validateSession(request: NextRequest): boolean {
  return validateUserAuthValues(
    request.cookies.get("gecko_session")?.value,
    request.headers.get("authorization")
  );
}
