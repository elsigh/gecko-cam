import { Suspense } from "react";
import { connection } from "next/server";
import LoginForm from "./LoginForm";

async function DynamicLoginForm() {
  await connection();

  return <LoginForm />;
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8">
          <span className="text-3xl">🦎</span>
          <h1 className="text-xl font-semibold">Gecko Cam</h1>
        </div>
        <Suspense>
          <DynamicLoginForm />
        </Suspense>
      </div>
    </div>
  );
}
