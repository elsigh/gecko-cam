import { Suspense } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import LoginForm from "./LoginForm";
import { validateUserAuthValues } from "@/lib/auth";

async function LoginGate() {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const isAuthenticated = validateUserAuthValues(
    cookieStore.get("gecko_session")?.value,
    headerStore.get("authorization")
  );

  if (isAuthenticated) {
    redirect("/");
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-sm flex-col justify-center">
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
        <h2 className="mb-4 text-lg font-semibold">Gecko Cam</h2>
        <LoginForm />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginGate />
    </Suspense>
  );
}
