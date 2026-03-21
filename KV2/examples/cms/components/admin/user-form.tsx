"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCreateUser, useUpdateUser } from "@/lib/hooks/use-users";

interface User {
  id: string;
  username: string;
  email: string;
  role: "admin" | "editor";
  createdAt: number;
}

interface UserFormProps {
  user?: User;
  mode: "create" | "edit";
}

const roleOptions = [
  { value: "editor", label: "Editor" },
  { value: "admin", label: "Admin" },
];

export function UserForm({ user, mode }: UserFormProps) {
  const router = useRouter();
  const { createUser, isCreating } = useCreateUser();
  const { updateUser, isUpdating } = useUpdateUser(user?.id ?? "");

  const [formData, setFormData] = useState({
    username: user?.username ?? "",
    email: user?.email ?? "",
    password: "",
    role: user?.role ?? "editor",
  });
  const [error, setError] = useState<string | null>(null);

  const isSubmitting = isCreating || isUpdating;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      if (mode === "create") {
        if (!formData.password) {
          setError("Password is required for new users");
          return;
        }
        await createUser({
          username: formData.username,
          email: formData.email,
          password: formData.password,
          role: formData.role as "admin" | "editor",
        });
        router.push("/admin/users");
      } else if (user) {
        await updateUser({
          username: formData.username,
          email: formData.email,
          password: formData.password || undefined,
          role: formData.role as "admin" | "editor",
        });
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>
            {mode === "create" ? "Create User" : "Edit User"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={formData.username}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, username: e.target.value }))
              }
              placeholder="Enter username"
              minLength={3}
              maxLength={50}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, email: e.target.value }))
              }
              placeholder="Enter email"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">
              Password{mode === "edit" && " (leave blank to keep current)"}
            </Label>
            <Input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, password: e.target.value }))
              }
              placeholder={
                mode === "create" ? "Enter password" : "Enter new password"
              }
              minLength={8}
              required={mode === "create"}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select
              value={formData.role}
              onValueChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  role: value as "admin" | "editor",
                }))
              }
              options={roleOptions}
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? "Saving..."
                : mode === "create"
                  ? "Create User"
                  : "Save Changes"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
          </div>

          {user && (
            <p className="text-xs text-zinc-500">
              Created {new Date(user.createdAt).toLocaleString()}
            </p>
          )}
        </CardContent>
      </Card>
    </form>
  );
}
