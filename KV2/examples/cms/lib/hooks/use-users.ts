"use client";

import useSWR from "swr";
import useSWRMutation from "swr/mutation";

interface User {
  id: string;
  username: string;
  email: string;
  role: "admin" | "editor";
  createdAt: number;
}

// Fetcher for SWR
async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error ?? "Request failed");
  }
  return res.json();
}

// List users
interface ListUsersResponse {
  users: User[];
  cursor?: string;
}

export function useUsers(options?: { limit?: number }) {
  const params = new URLSearchParams();
  if (options?.limit) params.set("limit", options.limit.toString());

  const url = `/api/users${params.toString() ? `?${params}` : ""}`;

  const { data, error, isLoading, mutate } = useSWR<ListUsersResponse>(
    url,
    fetcher
  );

  return {
    users: data?.users ?? [],
    cursor: data?.cursor,
    isLoading,
    error,
    mutate,
  };
}

// Get single user
export function useUser(id: string) {
  const { data, error, isLoading, mutate } = useSWR<User>(
    id ? `/api/users/${id}` : null,
    fetcher
  );

  return {
    user: data ?? null,
    isLoading,
    error,
    mutate,
  };
}

// Create user mutation
interface CreateUserInput {
  username: string;
  email: string;
  password: string;
  role: "admin" | "editor";
}

async function createUser(
  url: string,
  { arg }: { arg: CreateUserInput }
): Promise<User> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(arg),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error ?? "Failed to create user");
  }

  return res.json();
}

export function useCreateUser() {
  const { trigger, isMutating, error } = useSWRMutation(
    "/api/users",
    createUser
  );

  return {
    createUser: trigger,
    isCreating: isMutating,
    error,
  };
}

// Update user mutation
interface UpdateUserInput {
  username?: string;
  email?: string;
  password?: string;
  role?: "admin" | "editor";
}

async function updateUser(
  url: string,
  { arg }: { arg: UpdateUserInput }
): Promise<User> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(arg),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error ?? "Failed to update user");
  }

  return res.json();
}

export function useUpdateUser(id: string) {
  const { trigger, isMutating, error } = useSWRMutation(
    `/api/users/${id}`,
    updateUser
  );

  return {
    updateUser: trigger,
    isUpdating: isMutating,
    error,
  };
}

// Delete user mutation
async function deleteUser(url: string): Promise<{ success: boolean }> {
  const res = await fetch(url, { method: "DELETE" });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error ?? "Failed to delete user");
  }

  return res.json();
}

export function useDeleteUser(id: string) {
  const { trigger, isMutating, error } = useSWRMutation(
    `/api/users/${id}`,
    deleteUser
  );

  return {
    deleteUser: trigger,
    isDeleting: isMutating,
    error,
  };
}
