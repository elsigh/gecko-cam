import { KV2 } from "../cached-kv.js";
import { FakeBlobStore } from "../testing/fake-blob-store.js";
import { describe, expect, it } from "../testing/vitest-compat.js";
import type { TypedKV } from "../typed-kv.js";
import { KVIndexConflictError, KVVersionConflictError } from "../types.js";

// --- Domain types ---

interface User {
  id: string;
  email: string;
  username: string;
  name: string;
  role: string;
  status: "active" | "suspended" | "deleted";
  tags: string[];
}

interface Session {
  userId: string;
  token: string;
  userAgent: string;
  createdAt: number;
  expiresAt: number;
}

interface ApiKey {
  userId: string;
  name: string;
  keyHash: string;
  scopes: string[];
  createdAt: number;
}

interface AuditEntry {
  action: string;
  userId: string;
  target: string;
  timestamp: number;
  details: string;
}

// --- Helpers ---

function createTestKV() {
  const blobStore = new FakeBlobStore();
  const prefix =
    `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}/` as `${string}/`;
  const kv = new KV2<unknown>({ prefix, blobStore });
  return { kv, cleanup: () => blobStore.clear() };
}

function createStores(kv: KV2<unknown>) {
  const usersKV = kv.getStore<User>("user/").withIndexes({
    byEmail: { key: (u) => u.email, unique: true },
    byUsername: { key: (u) => u.username, unique: true },
    byRole: { key: (u) => u.role },
    byStatus: { key: (u) => u.status },
    byTag: { key: (u) => u.tags },
  });

  const sessionsKV = kv.getStore<Session>("session/").withIndexes({
    byUserId: { key: (s) => s.userId },
  });

  const apiKeysKV = kv.getStore<ApiKey>("apikey/").withIndexes({
    byUserId: { key: (k) => k.userId },
  });

  const auditKV: TypedKV<AuditEntry, unknown> =
    kv.getStore<AuditEntry>("audit/");

  return { usersKV, sessionsKV, apiKeysKV, auditKV };
}

function makeUser(overrides: Partial<User> & { id: string }): User {
  return {
    email: `${overrides.id}@example.com`,
    username: overrides.id,
    name: overrides.id,
    role: "user",
    status: "active",
    tags: [],
    ...overrides,
  };
}

// --- Tests ---

describe("Auth patterns", () => {
  // 1. Create user, retrieve by primary key
  it("create user and retrieve by primary key", async () => {
    const { kv } = createTestKV();
    const { usersKV } = createStores(kv);

    const user = makeUser({ id: "user-1", name: "Alice", email: "alice@example.com", username: "alice" });
    await usersKV.set("user-1", user);

    const val = await usersKV.getValue("user-1");
    expect(val).toBeDefined();
    expect(val!.name).toBe("Alice");
    expect(val!.email).toBe("alice@example.com");
    expect(val!.username).toBe("alice");
    expect(val!.role).toBe("user");
    expect(val!.status).toBe("active");
  });

  // 2. Look up user by unique index (email)
  it("look up user by email index", async () => {
    const { kv } = createTestKV();
    const { usersKV } = createStores(kv);

    await usersKV.set("user-1", makeUser({ id: "user-1", email: "alice@example.com", username: "alice" }));

    const val = await usersKV.getValue({ byEmail: "alice@example.com" });
    expect(val).toBeDefined();
    expect(val!.id).toBe("user-1");
  });

  // 3. Look up user by unique index (username)
  it("look up user by username index", async () => {
    const { kv } = createTestKV();
    const { usersKV } = createStores(kv);

    await usersKV.set("user-1", makeUser({ id: "user-1", username: "alice", email: "alice@example.com" }));

    const val = await usersKV.getValue({ byUsername: "alice" });
    expect(val).toBeDefined();
    expect(val!.id).toBe("user-1");
  });

  // 4. Duplicate email on different user throws KVIndexConflictError
  it("duplicate email throws KVIndexConflictError", async () => {
    const { kv } = createTestKV();
    const { usersKV } = createStores(kv);

    await usersKV.set("user-1", makeUser({ id: "user-1", email: "taken@example.com", username: "alice" }));

    let error: Error | undefined;
    try {
      await usersKV.set("user-2", makeUser({ id: "user-2", email: "taken@example.com", username: "bob" }));
    } catch (e) {
      error = e as Error;
    }

    expect(error).toBeInstanceOf(KVIndexConflictError);
    expect((error as KVIndexConflictError).indexName).toBe("byEmail");
    expect((error as KVIndexConflictError).indexKey).toBe("taken@example.com");
  });

  // 5. Duplicate username on different user throws KVIndexConflictError
  it("duplicate username throws KVIndexConflictError", async () => {
    const { kv } = createTestKV();
    const { usersKV } = createStores(kv);

    await usersKV.set("user-1", makeUser({ id: "user-1", username: "alice", email: "a@example.com" }));

    let error: Error | undefined;
    try {
      await usersKV.set("user-2", makeUser({ id: "user-2", username: "alice", email: "b@example.com" }));
    } catch (e) {
      error = e as Error;
    }

    expect(error).toBeInstanceOf(KVIndexConflictError);
    expect((error as KVIndexConflictError).indexName).toBe("byUsername");
    expect((error as KVIndexConflictError).indexKey).toBe("alice");
  });

  // 6. Update user profile via entry.update() with optimistic locking
  it("update user via entry.update() with optimistic locking", async () => {
    const { kv } = createTestKV();
    const { usersKV } = createStores(kv);

    await usersKV.set("user-1", makeUser({ id: "user-1", name: "Alice", username: "alice", email: "alice@example.com" }));

    const entry = await usersKV.get("user-1");
    expect(entry.exists).toBe(true);
    if (!entry.exists) return;

    const val = await entry.value;
    await entry.update({ ...val, name: "Alice Updated" });

    const updated = await usersKV.get("user-1");
    expect(updated.exists).toBe(true);
    if (updated.exists) {
      expect((await updated.value).name).toBe("Alice Updated");
    }
  });

  // 7. Concurrent profile updates → one wins, one gets KVVersionConflictError
  it("concurrent updates cause version conflict", async () => {
    const { kv } = createTestKV();
    const { usersKV } = createStores(kv);

    await usersKV.set("user-1", makeUser({ id: "user-1", name: "Alice", username: "alice", email: "alice@example.com" }));

    const entry1 = await usersKV.get("user-1");
    const entry2 = await usersKV.get("user-1");
    expect(entry1.exists && entry2.exists).toBe(true);
    if (!entry1.exists || !entry2.exists) return;

    // First update succeeds
    const val1 = await entry1.value;
    await entry1.update({ ...val1, name: "Alice V2" });

    // Second update fails (stale version)
    const val2 = await entry2.value;
    let error: Error | undefined;
    try {
      await entry2.update({ ...val2, name: "Alice V2 conflict" });
    } catch (e) {
      error = e as Error;
    }
    expect(error).toBeInstanceOf(KVVersionConflictError);
  });

  // 8. Change email on update: old index removed, new index works
  it("change email on update: old index removed, new index works", async () => {
    const { kv } = createTestKV();
    const { usersKV } = createStores(kv);

    await usersKV.set("user-1", makeUser({ id: "user-1", email: "old@example.com", username: "alice" }));

    // Update email
    await usersKV.set("user-1", makeUser({ id: "user-1", email: "new@example.com", username: "alice" }));

    // Old email index gone
    expect((await usersKV.get({ byEmail: "old@example.com" })).exists).toBe(false);

    // New email index works
    const result = await usersKV.get({ byEmail: "new@example.com" });
    expect(result.exists).toBe(true);
    if (result.exists) {
      expect((await result.value).id).toBe("user-1");
    }
  });

  // 9. Delete user removes all index entries
  it("delete user removes all index entries", async () => {
    const { kv } = createTestKV();
    const { usersKV } = createStores(kv);

    await usersKV.set("user-1", makeUser({
      id: "user-1",
      email: "alice@example.com",
      username: "alice",
      role: "admin",
      status: "active",
      tags: ["vip"],
    }));

    await usersKV.delete("user-1");

    // Primary key gone
    expect((await usersKV.get("user-1")).exists).toBe(false);

    // All indexes gone
    expect((await usersKV.get({ byEmail: "alice@example.com" })).exists).toBe(false);
    expect((await usersKV.get({ byUsername: "alice" })).exists).toBe(false);

    const roleKeys: string[] = [];
    for await (const k of usersKV.keys({ byRole: "admin" })) {
      roleKeys.push(k);
    }
    expect(roleKeys).toEqual([]);

    const statusKeys: string[] = [];
    for await (const k of usersKV.keys({ byStatus: "active" })) {
      statusKeys.push(k);
    }
    expect(statusKeys).toEqual([]);

    const tagKeys: string[] = [];
    for await (const k of usersKV.keys({ byTag: "vip" })) {
      tagKeys.push(k);
    }
    expect(tagKeys).toEqual([]);
  });

  // 10. List users by role (non-unique index)
  it("list users by role (non-unique index)", async () => {
    const { kv } = createTestKV();
    const { usersKV } = createStores(kv);

    await usersKV.set("user-1", makeUser({ id: "user-1", username: "alice", email: "a@x.com", role: "admin" }));
    await usersKV.set("user-2", makeUser({ id: "user-2", username: "bob", email: "b@x.com", role: "admin" }));
    await usersKV.set("user-3", makeUser({ id: "user-3", username: "carol", email: "c@x.com", role: "user" }));

    const adminKeys: string[] = [];
    for await (const k of usersKV.keys({ byRole: "admin" })) {
      adminKeys.push(k);
    }
    expect(adminKeys.length).toBe(2);
    expect(adminKeys).toContain("user-1");
    expect(adminKeys).toContain("user-2");

    const userKeys: string[] = [];
    for await (const k of usersKV.keys({ byRole: "user" })) {
      userKeys.push(k);
    }
    expect(userKeys).toEqual(["user-3"]);
  });

  // 11. List users by status with pagination
  it("list users by status with pagination", async () => {
    const { kv } = createTestKV();
    const { usersKV } = createStores(kv);

    for (let i = 0; i < 5; i++) {
      await usersKV.set(`user-${i}`, makeUser({
        id: `user-${i}`,
        username: `u${i}`,
        email: `u${i}@x.com`,
        status: "active",
      }));
    }
    await usersKV.set("user-suspended", makeUser({
      id: "user-suspended",
      username: "suspended",
      email: "s@x.com",
      status: "suspended",
    }));

    // Paginate active users
    const page1 = await usersKV.entries({ byStatus: "active" }).page(3);
    expect(page1.entries.length).toBe(3);
    expect(page1.cursor).toBeDefined();

    const page2 = await usersKV.entries({ byStatus: "active" }).page(3, page1.cursor);
    expect(page2.entries.length).toBe(2);

    // Suspended has only 1
    const suspKeys: string[] = [];
    for await (const k of usersKV.keys({ byStatus: "suspended" })) {
      suspKeys.push(k);
    }
    expect(suspKeys).toEqual(["user-suspended"]);
  });

  // 12. Filter users by role prefix scan
  it("filter users by role prefix scan", async () => {
    const { kv } = createTestKV();
    const { usersKV } = createStores(kv);

    await usersKV.set("user-1", makeUser({ id: "user-1", username: "a", email: "a@x.com", role: "admin" }));
    await usersKV.set("user-2", makeUser({ id: "user-2", username: "b", email: "b@x.com", role: "admin-super" }));
    await usersKV.set("user-3", makeUser({ id: "user-3", username: "c", email: "c@x.com", role: "user" }));

    const adminPrefixKeys: string[] = [];
    for await (const k of usersKV.keys({ byRole: { prefix: "admin" } })) {
      adminPrefixKeys.push(k);
    }
    expect(adminPrefixKeys.length).toBe(2);
    expect(adminPrefixKeys).toContain("user-1");
    expect(adminPrefixKeys).toContain("user-2");
  });

  // 13. Multi-value index: filter by tag
  it("multi-value index: filter by tag", async () => {
    const { kv } = createTestKV();
    const { usersKV } = createStores(kv);

    await usersKV.set("user-1", makeUser({ id: "user-1", username: "a", email: "a@x.com", tags: ["vip", "beta"] }));
    await usersKV.set("user-2", makeUser({ id: "user-2", username: "b", email: "b@x.com", tags: ["beta"] }));
    await usersKV.set("user-3", makeUser({ id: "user-3", username: "c", email: "c@x.com", tags: ["vip"] }));

    const vipKeys: string[] = [];
    for await (const k of usersKV.keys({ byTag: "vip" })) {
      vipKeys.push(k);
    }
    expect(vipKeys.length).toBe(2);
    expect(vipKeys).toContain("user-1");
    expect(vipKeys).toContain("user-3");

    const betaKeys: string[] = [];
    for await (const k of usersKV.keys({ byTag: "beta" })) {
      betaKeys.push(k);
    }
    expect(betaKeys.length).toBe(2);
    expect(betaKeys).toContain("user-1");
    expect(betaKeys).toContain("user-2");
  });

  // 14. Update tags: removed tags disappear from index, added tags appear
  it("update tags: removed tags disappear, added tags appear", async () => {
    const { kv } = createTestKV();
    const { usersKV } = createStores(kv);

    await usersKV.set("user-1", makeUser({ id: "user-1", username: "a", email: "a@x.com", tags: ["vip", "beta"] }));

    // Update: remove "vip", add "enterprise"
    await usersKV.set("user-1", makeUser({ id: "user-1", username: "a", email: "a@x.com", tags: ["beta", "enterprise"] }));

    // "vip" index no longer has user-1
    const vipKeys: string[] = [];
    for await (const k of usersKV.keys({ byTag: "vip" })) {
      vipKeys.push(k);
    }
    expect(vipKeys).toEqual([]);

    // "beta" still has user-1
    const betaKeys: string[] = [];
    for await (const k of usersKV.keys({ byTag: "beta" })) {
      betaKeys.push(k);
    }
    expect(betaKeys).toEqual(["user-1"]);

    // "enterprise" now has user-1
    const entKeys: string[] = [];
    for await (const k of usersKV.keys({ byTag: "enterprise" })) {
      entKeys.push(k);
    }
    expect(entKeys).toEqual(["user-1"]);
  });

  // 15. getMany loads multiple users in one call
  it("getMany loads multiple users in one call", async () => {
    const { kv } = createTestKV();
    const { usersKV } = createStores(kv);

    await usersKV.set("user-1", makeUser({ id: "user-1", username: "alice", email: "a@x.com", name: "Alice" }));
    await usersKV.set("user-2", makeUser({ id: "user-2", username: "bob", email: "b@x.com", name: "Bob" }));
    await usersKV.set("user-3", makeUser({ id: "user-3", username: "carol", email: "c@x.com", name: "Carol" }));

    const results = await usersKV.getMany(["user-1", "user-3", "user-missing"]);

    expect(results.size).toBe(2);
    expect(results.has("user-1")).toBe(true);
    expect(results.has("user-3")).toBe(true);
    expect(results.has("user-missing")).toBe(false);

    const alice = results.get("user-1")!;
    expect((await alice.value).name).toBe("Alice");

    const carol = results.get("user-3")!;
    expect((await carol.value).name).toBe("Carol");
  });

  // 16. List all users by key prefix (org-based keys)
  it("list users by key prefix (org-based keys)", async () => {
    const { kv } = createTestKV();
    const { usersKV } = createStores(kv);

    await usersKV.set("org-1/user-1", makeUser({ id: "user-1", username: "a1", email: "a1@x.com" }));
    await usersKV.set("org-1/user-2", makeUser({ id: "user-2", username: "a2", email: "a2@x.com" }));
    await usersKV.set("org-2/user-3", makeUser({ id: "user-3", username: "a3", email: "a3@x.com" }));

    const org1Keys: string[] = [];
    for await (const k of usersKV.keys("org-1/")) {
      org1Keys.push(k);
    }
    expect(org1Keys.length).toBe(2);
    expect(org1Keys).toContain("org-1/user-1");
    expect(org1Keys).toContain("org-1/user-2");

    const org2Keys: string[] = [];
    for await (const k of usersKV.keys("org-2/")) {
      org2Keys.push(k);
    }
    expect(org2Keys).toEqual(["org-2/user-3"]);
  });

  // 17. Create session tied to user, look up sessions by userId
  it("create session, look up by userId index", async () => {
    const { kv } = createTestKV();
    const { sessionsKV } = createStores(kv);

    await sessionsKV.set("sess-1", {
      userId: "user-1",
      token: "tok-abc",
      userAgent: "Chrome",
      createdAt: 1000,
      expiresAt: 9999,
    });
    await sessionsKV.set("sess-2", {
      userId: "user-1",
      token: "tok-def",
      userAgent: "Firefox",
      createdAt: 2000,
      expiresAt: 9999,
    });
    await sessionsKV.set("sess-3", {
      userId: "user-2",
      token: "tok-ghi",
      userAgent: "Safari",
      createdAt: 3000,
      expiresAt: 9999,
    });

    // Look up all sessions for user-1
    const user1Sessions: string[] = [];
    for await (const k of sessionsKV.keys({ byUserId: "user-1" })) {
      user1Sessions.push(k);
    }
    expect(user1Sessions.length).toBe(2);
    expect(user1Sessions).toContain("sess-1");
    expect(user1Sessions).toContain("sess-2");

    const user2Sessions: string[] = [];
    for await (const k of sessionsKV.keys({ byUserId: "user-2" })) {
      user2Sessions.push(k);
    }
    expect(user2Sessions).toEqual(["sess-3"]);
  });

  // 18. Revoke all sessions for a user
  it("revoke all sessions for a user", async () => {
    const { kv } = createTestKV();
    const { sessionsKV } = createStores(kv);

    await sessionsKV.set("sess-1", {
      userId: "user-1",
      token: "tok-1",
      userAgent: "Chrome",
      createdAt: 1000,
      expiresAt: 9999,
    });
    await sessionsKV.set("sess-2", {
      userId: "user-1",
      token: "tok-2",
      userAgent: "Firefox",
      createdAt: 2000,
      expiresAt: 9999,
    });
    await sessionsKV.set("sess-3", {
      userId: "user-2",
      token: "tok-3",
      userAgent: "Safari",
      createdAt: 3000,
      expiresAt: 9999,
    });

    // Revoke all sessions for user-1
    const toRevoke: string[] = [];
    for await (const k of sessionsKV.keys({ byUserId: "user-1" })) {
      toRevoke.push(k);
    }
    for (const k of toRevoke) {
      await sessionsKV.delete(k);
    }

    // user-1 sessions gone
    const remaining: string[] = [];
    for await (const k of sessionsKV.keys({ byUserId: "user-1" })) {
      remaining.push(k);
    }
    expect(remaining).toEqual([]);

    // user-2 session still exists
    const user2Sessions: string[] = [];
    for await (const k of sessionsKV.keys({ byUserId: "user-2" })) {
      user2Sessions.push(k);
    }
    expect(user2Sessions).toEqual(["sess-3"]);
  });

  // 19. API key CRUD with userId index
  it("API key CRUD with userId index", async () => {
    const { kv } = createTestKV();
    const { apiKeysKV } = createStores(kv);

    await apiKeysKV.set("key-1", {
      userId: "user-1",
      name: "Production",
      keyHash: "hash-abc",
      scopes: ["read", "write"],
      createdAt: 1000,
    });
    await apiKeysKV.set("key-2", {
      userId: "user-1",
      name: "Staging",
      keyHash: "hash-def",
      scopes: ["read"],
      createdAt: 2000,
    });

    // Look up by userId
    const user1Keys: string[] = [];
    for await (const k of apiKeysKV.keys({ byUserId: "user-1" })) {
      user1Keys.push(k);
    }
    expect(user1Keys.length).toBe(2);

    // Read one key
    const key1 = await apiKeysKV.get("key-1");
    expect(key1.exists).toBe(true);
    if (key1.exists) {
      expect((await key1.value).name).toBe("Production");
    }

    // Delete one key
    await apiKeysKV.delete("key-1");
    expect((await apiKeysKV.get("key-1")).exists).toBe(false);

    // Only key-2 remains in index
    const remainingKeys: string[] = [];
    for await (const k of apiKeysKV.keys({ byUserId: "user-1" })) {
      remainingKeys.push(k);
    }
    expect(remainingKeys).toEqual(["key-2"]);
  });

  // 20. Audit log: append entries, query by user prefix
  it("audit log: append entries and query by user prefix", async () => {
    const { kv } = createTestKV();
    const { auditKV } = createStores(kv);

    await auditKV.set("user-1/1000", {
      action: "login",
      userId: "user-1",
      target: "session",
      timestamp: 1000,
      details: "Logged in from Chrome",
    });
    await auditKV.set("user-1/2000", {
      action: "update-profile",
      userId: "user-1",
      target: "profile",
      timestamp: 2000,
      details: "Changed email",
    });
    await auditKV.set("user-2/1500", {
      action: "login",
      userId: "user-2",
      target: "session",
      timestamp: 1500,
      details: "Logged in from Safari",
    });

    // Query user-1 audit entries
    const user1Entries: [string, AuditEntry][] = [];
    for await (const [key, entry] of auditKV.entries<AuditEntry>("user-1/")) {
      user1Entries.push([key, await entry.value]);
    }
    expect(user1Entries.length).toBe(2);
    expect(user1Entries[0][1].action).toBe("login");
    expect(user1Entries[1][1].action).toBe("update-profile");

    // Query user-2 audit entries
    const user2Entries: [string, AuditEntry][] = [];
    for await (const [key, entry] of auditKV.entries<AuditEntry>("user-2/")) {
      user2Entries.push([key, await entry.value]);
    }
    expect(user2Entries.length).toBe(1);
    expect(user2Entries[0][1].action).toBe("login");
  });

  // 21. Multi-store isolation: users, sessions, api-keys, audit don't collide
  it("multi-store isolation: stores don't collide", async () => {
    const { kv } = createTestKV();
    const { usersKV, sessionsKV, apiKeysKV, auditKV } = createStores(kv);

    await usersKV.set("item-1", makeUser({ id: "item-1", username: "a", email: "a@x.com" }));
    await sessionsKV.set("item-1", {
      userId: "user-1",
      token: "tok",
      userAgent: "Chrome",
      createdAt: 1000,
      expiresAt: 9999,
    });
    await apiKeysKV.set("item-1", {
      userId: "user-1",
      name: "Key",
      keyHash: "hash",
      scopes: ["read"],
      createdAt: 1000,
    });
    await auditKV.set("item-1", {
      action: "login",
      userId: "user-1",
      target: "session",
      timestamp: 1000,
      details: "test",
    });

    // Each store only sees its own keys
    const collect = async (iter: AsyncIterable<string>) => {
      const keys: string[] = [];
      for await (const k of iter) keys.push(k);
      return keys;
    };

    expect(await collect(usersKV.keys())).toEqual(["item-1"]);
    expect(await collect(sessionsKV.keys())).toEqual(["item-1"]);
    expect(await collect(apiKeysKV.keys())).toEqual(["item-1"]);
    expect(await collect(auditKV.keys())).toEqual(["item-1"]);

    // Verify the values are different types
    const user = await usersKV.get("item-1");
    const session = await sessionsKV.get("item-1");
    expect(user.exists && session.exists).toBe(true);
    if (user.exists && session.exists) {
      expect((await user.value).username).toBe("a");
      expect((await session.value).token).toBe("tok");
    }
  });

  // 22. Soft-delete user (status→deleted), still findable by status index
  it("soft-delete user: change status to deleted, findable by status index", async () => {
    const { kv } = createTestKV();
    const { usersKV } = createStores(kv);

    await usersKV.set("user-1", makeUser({ id: "user-1", username: "alice", email: "a@x.com", status: "active" }));
    await usersKV.set("user-2", makeUser({ id: "user-2", username: "bob", email: "b@x.com", status: "active" }));

    // Soft-delete user-1
    await usersKV.set("user-1", makeUser({ id: "user-1", username: "alice", email: "a@x.com", status: "deleted" }));

    // user-1 no longer in active index
    const activeKeys: string[] = [];
    for await (const k of usersKV.keys({ byStatus: "active" })) {
      activeKeys.push(k);
    }
    expect(activeKeys).toEqual(["user-2"]);

    // user-1 now in deleted index
    const deletedKeys: string[] = [];
    for await (const k of usersKV.keys({ byStatus: "deleted" })) {
      deletedKeys.push(k);
    }
    expect(deletedKeys).toEqual(["user-1"]);

    // user-1 still retrievable by primary key
    const result = await usersKV.get("user-1");
    expect(result.exists).toBe(true);
    if (result.exists) {
      expect((await result.value).status).toBe("deleted");
    }

    // Still findable by email and username
    expect((await usersKV.get({ byEmail: "a@x.com" })).exists).toBe(true);
    expect((await usersKV.get({ byUsername: "alice" })).exists).toBe(true);
  });
});
