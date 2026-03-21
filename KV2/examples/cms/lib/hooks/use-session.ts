"use client";

import useSWR from "swr";

interface SessionUser {
  id: string;
  username: string;
  role: "admin" | "editor";
}

interface SessionResponse {
  authenticated: boolean;
  user?: SessionUser;
}

async function fetcher(url: string): Promise<SessionResponse> {
  const res = await fetch(url);
  if (res.status === 401) {
    return { authenticated: false };
  }
  if (!res.ok) {
    throw new Error("Failed to fetch session");
  }
  return res.json();
}

export function useSession() {
  const { data, error, isLoading, mutate } = useSWR<SessionResponse>(
    "/api/auth/session",
    fetcher,
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    }
  );

  return {
    user: data?.user ?? null,
    isAuthenticated: data?.authenticated ?? false,
    isLoading,
    error,
    mutate,
  };
}

export async function login(
  username: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const data = await res.json();
    return { success: false, error: data.error ?? "Login failed" };
  }

  return { success: true };
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}
