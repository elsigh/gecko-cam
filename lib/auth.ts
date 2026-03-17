import { NextRequest } from "next/server";
import { createHmac } from "crypto";

export function validateApiSecret(request: NextRequest): boolean {
  const secret = request.headers.get("x-api-secret");
  const expected = process.env.API_SECRET;

  if (!expected) {
    console.error("API_SECRET env var not set");
    return false;
  }

  return secret === expected;
}

export function validateSession(request: NextRequest): boolean {
  const sitePassword = process.env.SITE_PASSWORD;
  const secret = process.env.API_SECRET;
  if (!sitePassword || !secret) return true; // no password configured

  const expected = createHmac("sha256", secret).update(sitePassword).digest("hex");
  const cookie = request.cookies.get("gecko_session")?.value;
  return cookie === expected;
}
