import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getUserSafe } from "@/lib/users";
import { UserForm } from "@/components/admin/user-form";

export const metadata: Metadata = {
  title: "Edit User",
};

interface EditUserPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditUserPage({ params }: EditUserPageProps) {
  try {
    await requireAdmin();
  } catch {
    redirect("/admin");
  }

  const { id } = await params;
  const user = await getUserSafe(id);

  if (!user) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">Edit User</h1>
      <UserForm user={user} mode="edit" />
    </div>
  );
}
