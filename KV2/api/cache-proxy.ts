/**
 * Cache Proxy API - Proxies cache operations for local development.
 * This allows local dev to use the real Vercel cache via this deployed endpoint.
 *
 * All operations use POST with JSON body to avoid URL encoding issues with unicode.
 *
 * Endpoints:
 * - POST ?op=get (body: {key}) - Get a cached value
 * - POST ?op=set (body: {key, value, tags?, ttl?}) - Set a cached value
 * - POST ?op=expireTag (body: {tags}) - Expire cache tags
 */

import { getCache } from "@vercel/functions";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const op = url.searchParams.get("op");

  // Legacy support for GET with key in URL (ASCII keys only)
  if (op === "get") {
    const key = url.searchParams.get("key");
    if (!key) {
      return json({ error: "Missing key parameter" }, 400);
    }
    try {
      const cache = getCache();
      const value = await cache.get(key);
      return json({ value });
    } catch (err) {
      return json(
        { error: err instanceof Error ? err.message : String(err) },
        500,
      );
    }
  }

  return json({ error: `Unknown operation: ${op}` }, 400);
}

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const op = url.searchParams.get("op");

  try {
    const body = (await request.json()) as {
      key?: string;
      value?: unknown;
      tags?: string[];
      ttl?: number;
    };

    if (op === "get") {
      const key = body.key ?? url.searchParams.get("key");
      if (!key) {
        return json({ error: "Missing key parameter" }, 400);
      }
      const cache = getCache();
      const value = await cache.get(key);
      return json({ value });
    }

    if (op === "set") {
      const key = body.key ?? url.searchParams.get("key");
      if (!key) {
        return json({ error: "Missing key parameter" }, 400);
      }
      const cache = getCache();
      await cache.set(key, body.value, {
        tags: body.tags,
        ttl: body.ttl,
      });
      return json({ success: true });
    }

    if (op === "expireTag") {
      const tags = body.tags;
      if (!tags || tags.length === 0) {
        return json({ error: "Missing tags parameter" }, 400);
      }
      const cache = getCache();
      await cache.expireTag(tags);
      return json({ success: true });
    }

    return json({ error: `Unknown operation: ${op}` }, 400);
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
