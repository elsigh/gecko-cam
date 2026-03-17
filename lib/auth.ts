import { NextRequest } from "next/server";

export function validateApiSecret(request: NextRequest): boolean {
  const secret = request.headers.get("x-api-secret");
  const expected = process.env.API_SECRET;

  if (!expected) {
    console.error("API_SECRET env var not set");
    return false;
  }

  return secret === expected;
}
