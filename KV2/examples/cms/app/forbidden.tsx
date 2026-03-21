import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Forbidden() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900">
      <div className="text-center">
        <h1 className="text-4xl font-bold">403</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          You don&apos;t have permission to access this page.
        </p>
        <Button asChild className="mt-4">
          <Link href="/admin">Back to Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
