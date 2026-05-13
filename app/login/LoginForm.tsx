"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

function normalizeRedirectPath(from: string | null): string {
  if (!from || !from.startsWith("/") || from.startsWith("//")) {
    return "/";
  }

  return from;
}

export default function LoginForm() {
  const searchParams = useSearchParams();
  const from = normalizeRedirectPath(searchParams.get("from"));
  const error = searchParams.get("error");

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <form
      method="POST"
      action={`/api/login?from=${encodeURIComponent(from)}`}
      onSubmit={() => setLoading(true)}
      className="flex flex-col gap-4"
    >
      <div>
        <label htmlFor="password" className="block text-sm text-gray-400 mb-1">
          Password
        </label>
        <input
          name="password"
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-gray-500"
          required
        />
      </div>
      {error === "incorrect" && (
        <p className="text-red-400 text-sm">Incorrect password.</p>
      )}
      {error === "config" && (
        <p className="text-red-400 text-sm">Login is not configured correctly.</p>
      )}
      {error === "rate_limited" && (
        <p className="text-red-400 text-sm">Too many login attempts. Try again in a few minutes.</p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="bg-white text-gray-900 font-medium rounded-lg px-4 py-2 hover:bg-gray-100 transition-colors disabled:opacity-50"
      >
        {loading ? "Checking…" : "Enter"}
      </button>
    </form>
  );
}
