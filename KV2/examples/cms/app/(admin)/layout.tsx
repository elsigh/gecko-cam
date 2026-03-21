import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Sidebar } from "@/components/admin/sidebar";

export const metadata: Metadata = {
  title: {
    template: "%s | [Admin]",
    default: "[Admin]",
  },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-zinc-50 p-8 dark:bg-zinc-900">
        {children}
      </main>
    </div>
  );
}
