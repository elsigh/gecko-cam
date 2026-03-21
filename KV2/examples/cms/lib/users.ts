import { KVIndexConflictError } from "@vercel/kv2";
import { usersKV } from "./kv";
import { hashPassword } from "./auth";
import type { User, CreateUserRequest, UpdateUserRequest } from "./types";
import { ConflictError, NotFoundError } from "./types";

// Generate a unique user ID
function generateUserId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `u-${timestamp}-${random}`;
}

// Create a new user
export async function createUser(
  input: CreateUserRequest
): Promise<Omit<User, "passwordHash">> {
  const id = generateUserId();
  const now = Date.now();

  const user: User = {
    id,
    username: input.username,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    role: input.role,
    createdAt: now,
  };

  try {
    await usersKV.set(id, user);
  } catch (e) {
    if (e instanceof KVIndexConflictError) {
      throw new ConflictError({
        message: `Username "${input.username}" is already taken`,
        currentVersion: 0,
        expectedVersion: 0,
      });
    }
    throw e;
  }

  const { passwordHash: _, ...safeUser } = user;
  return safeUser;
}

// Get a user by ID
export async function getUser(id: string): Promise<User | null> {
  return (await usersKV.getValue(id)) ?? null;
}

// Get a user by ID without password hash (for API responses)
export async function getUserSafe(
  id: string
): Promise<Omit<User, "passwordHash"> | null> {
  const user = await getUser(id);
  if (!user) return null;

  const { passwordHash: _, ...safeUser } = user;
  return safeUser;
}

// Get a user by username (for login)
export async function getUserByUsername(
  username: string
): Promise<User | null> {
  return (await usersKV.getValue({ byUsername: username })) ?? null;
}

// Update a user
export async function updateUser(
  id: string,
  updates: UpdateUserRequest
): Promise<Omit<User, "passwordHash">> {
  const current = await getUser(id);
  if (!current) {
    throw new NotFoundError(`User ${id} not found`);
  }

  // Build updated user
  const updatedUser: User = {
    ...current,
    username: updates.username ?? current.username,
    email: updates.email ?? current.email,
    role: updates.role ?? current.role,
    passwordHash: updates.password
      ? await hashPassword(updates.password)
      : current.passwordHash,
  };

  try {
    await usersKV.set(id, updatedUser);
  } catch (e) {
    if (e instanceof KVIndexConflictError) {
      throw new ConflictError({
        message: `Username "${updates.username}" is already taken`,
        currentVersion: 0,
        expectedVersion: 0,
      });
    }
    throw e;
  }

  const { passwordHash: _, ...safeUser } = updatedUser;
  return safeUser;
}

// Delete a user
export async function deleteUser(id: string): Promise<void> {
  await usersKV.delete(id);
}

// List all users with pagination
export async function listUsers(options: { limit?: number; cursor?: string } = {}): Promise<{
  users: Omit<User, "passwordHash">[];
  cursor?: string;
}> {
  const { limit = 20, cursor } = options;

  const { entries, cursor: nextCursor } = await usersKV
    .entries()
    .page(limit, cursor);

  const users: Omit<User, "passwordHash">[] = [];
  for (const [, entry] of entries) {
    const value = await entry.value;
    if (value) {
      const { passwordHash: _, ...safeUser } = value;
      users.push(safeUser);
    }
  }

  return { users, cursor: nextCursor };
}

// Check if any users exist (for initial setup)
export async function hasUsers(): Promise<boolean> {
  for await (const _ of usersKV.keys()) {
    return true;
  }
  return false;
}
