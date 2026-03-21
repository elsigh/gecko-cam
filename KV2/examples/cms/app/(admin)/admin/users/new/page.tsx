import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { UserForm } from "@/components/admin/user-form";

export const metadata: Metadata = {
  title: "New User",
};

export default async function NewUserPage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/admin");
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">New User</h1>
      <UserForm mode="create" />
    </div>
  );
}
