import { NextRequest, NextResponse } from "next/server";
import { createSessionToken } from "@/lib/auth";

function normalizeRedirectPath(from: string | null): string {
  if (!from || !from.startsWith("/") || from.startsWith("//")) {
    return "/";
  }

  return from;
}

export async function POST(request: NextRequest) {
  const from = normalizeRedirectPath(request.nextUrl.searchParams.get("from"));
  const contentType = request.headers.get("content-type") ?? "";
  const isJsonRequest = contentType.includes("application/json");

  let password = "";
  try {
    if (isJsonRequest) {
      ({ password = "" } = await request.json());
    } else {
      const formData = await request.formData();
      const passwordField = formData.get("password");
      password = typeof passwordField === "string" ? passwordField : "";
    }
  } catch {
    password = "";
  }

  const sitePassword = process.env.SITE_PASSWORD;
  const secret = process.env.API_SECRET;

  if (!sitePassword || !secret) {
    if (!isJsonRequest) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("error", "config");
      if (from !== "/") {
        loginUrl.searchParams.set("from", from);
      }
      return NextResponse.redirect(loginUrl, 303);
    }
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  if (password !== sitePassword) {
    if (!isJsonRequest) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("error", "incorrect");
      if (from !== "/") {
        loginUrl.searchParams.set("from", from);
      }
      return NextResponse.redirect(loginUrl, 303);
    }
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const token = createSessionToken(password, secret);

  const response = isJsonRequest
    ? NextResponse.json({ ok: true })
    : NextResponse.redirect(new URL(from, request.url), 303);
  response.cookies.set("gecko_session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });

  return response;
}
