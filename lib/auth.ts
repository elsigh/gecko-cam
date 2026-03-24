import { NextRequest } from "next/server";
import { createHmac } from "crypto";

export function createSessionToken(password: string, secret: string): string {
  return createHmac("sha256", secret).update(password).digest("hex");
}

export function validateApiSecret(request: NextRequest): boolean {
  const secret = request.headers.get("x-api-secret");
  const expected = process.env.API_SECRET;

  if (!expected) {
    console.error("API_SECRET env var not set");
    return false;
  }

  return secret === expected;
}

export function validateSessionToken(cookie: string | undefined): boolean {
  const sitePassword = process.env.SITE_PASSWORD;
  const secret = process.env.API_SECRET;
  if (!sitePassword || !secret) return true; // no password configured

  return cookie === createSessionToken(sitePassword, secret);
}

export function validateSession(request: NextRequest): boolean {
  return validateSessionToken(request.cookies.get("gecko_session")?.value);
}
