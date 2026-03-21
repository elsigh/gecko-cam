import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { unauthorized, forbidden } from "next/navigation";
import { sessionsKV } from "./kv";
import type { Session, User } from "./types";

const SESSION_COOKIE_NAME = "cms_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const BCRYPT_ROUNDS = 10;

// Password hashing
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Session management
function generateSessionId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createSession(user: User): Promise<string> {
  const sessionId = generateSessionId();
  const now = Date.now();

  const session: Session = {
    userId: user.id,
    username: user.username,
    role: user.role,
    createdAt: now,
    expiresAt: now + SESSION_DURATION_MS,
  };

  await sessionsKV.set(sessionId, session);

  // Set cookie
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
  });

  return sessionId;
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionId) {
    return null;
  }

  const session = await sessionsKV.getValue(sessionId);
  if (!session) {
    return null;
  }

  // Check if session expired
  if (session.expiresAt < Date.now()) {
    await sessionsKV.delete(sessionId);
    return null;
  }

  return session;
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    unauthorized();
  }
  return session;
}

export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  if (session.role !== "admin") {
    forbidden();
  }
  return session;
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionId) {
    await sessionsKV.delete(sessionId);
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}

// API route helper - returns session or null (for use in API routes where we need JSON responses)
export async function getSessionForApi(): Promise<Session | null> {
  return getSession();
}

// API route helper - returns session or null, checks for admin
export async function getAdminSessionForApi(): Promise<Session | null> {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return null;
  }
  return session;
}
