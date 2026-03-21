[Home](../README.md) | [Previous: Schema and Trees](schema-and-trees.md) | [Next: Caching](caching.md)

# Indexes

Secondary indexes allow you to look up entries by attributes other than the primary key.

## Defining Indexes

Pass an `indexes` record to `getStore()`. Each index defines a `key` function that extracts the index key from the value.

Use `defineIndexes<V>()` to let TypeScript infer the index names automatically instead of spelling them out as a type parameter:

```typescript
import { defineIndexes } from "@vercel/kv2";

interface Doc {
  slug: string;
  status: string;
  tags: string[];
  title: string;
  content: string;
  authorId: string;
}

const docs = kv.getStore("docs/", defineIndexes<Doc>()({
  bySlug: {
    key: (doc) => doc.slug,
    unique: true,
  },
  byStatus: {
    key: (doc) => doc.status,
  },
}));
```

## Unique Indexes

Set `unique: true` to enforce uniqueness. A `KVIndexConflictError` is thrown if a duplicate is detected:

```typescript
import { KVIndexConflictError } from "@vercel/kv2";

try {
  await docs.set("doc-2", {
    slug: "existing-slug", // already used by another doc
    status: "draft",
    tags: [],
    title: "Duplicate",
    content: "",
    authorId: "author-1",
  });
} catch (error) {
  if (error instanceof KVIndexConflictError) {
    console.log(error.indexName); // "bySlug"
    console.log(error.indexKey);  // "existing-slug"
  }
}
```

## Multi-Value Indexes

Return an array from the `key` function to index an entry under multiple keys:

```typescript
interface Doc {
  slug: string;
  status: string;
  tags: string[];
  title: string;
  content: string;
  authorId: string;
}

const docs = kv.getStore<Doc, undefined, "byTag">("docs/", {
  byTag: {
    key: (doc) => doc.tags, // each tag becomes an index entry
  },
});

await docs.set("doc-1", {
  slug: "hello",
  status: "published",
  tags: ["typescript", "tutorial"],
  title: "Hello",
  content: "World",
  authorId: "author-1",
});

// Find all docs tagged "typescript"
for await (const key of docs.keys({ byTag: "typescript" })) {
  console.log(key); // "doc-1"
}
```

## Non-Unique Indexes

Query non-unique indexes with `keys()` and `entries()`:

```typescript
// Find all published docs
for await (const key of docs.keys({ byStatus: "published" })) {
  console.log(key);
}

// Iterate entries by index
for await (const [key, entry] of docs.entries({ byStatus: "draft" })) {
  console.log(key, (await entry.value).title);
}
```

## Prefix Queries (Sorted Iteration)

Use `{ prefix: string }` instead of a plain string value to scan all index entries whose key starts with the given prefix. Results are returned in lexicographic order of the index key.

```typescript
interface Order {
  customer: string;
  createdAt: string; // ISO date, e.g. "2024-01-15T10:30:00Z"
  status: string;
}

const orders = kv.getStore<Order, undefined, "byCreatedAt" | "byStatus">("orders/", {
  byCreatedAt: { key: (o) => o.createdAt },
  byStatus: { key: (o) => o.status },
});

// All orders created in January 2024, sorted by date
for await (const [key, entry] of orders.entries({ byCreatedAt: { prefix: "2024-01" } })) {
  console.log(key, (await entry.value).createdAt);
}

// All entries sorted by index (empty prefix = match everything)
for await (const key of orders.keys({ byCreatedAt: { prefix: "" } })) {
  console.log(key);
}

// Pagination works the same way
const page = await orders.entries({ byCreatedAt: { prefix: "2024-01" } }).page(20);
```

Prefix queries work with both unique and non-unique indexes. They are **not supported** with `get()` (which returns a single result) — use `keys()` or `entries()` instead.

## Composite Index Keys

Concatenate multiple fields into a single index key to support "group by X, sort by Y" queries. Since index entries are scanned lexicographically, the field order determines grouping and sort order.

```typescript
interface Session {
  ownerId: string;
  createdAt: string; // ISO date
  device: string;
}

const sessions = kv.getStore<Session, undefined, "byOwnerDate">("sessions/", {
  byOwnerDate: {
    // owner first (grouping), then date (sorting within group)
    key: (s) => `${s.ownerId}/${s.createdAt}`,
  },
});
```

Use a prefix query to filter by the leading field(s):

```typescript
// All sessions for user-42, sorted by date
for await (const [key, entry] of sessions.entries({ byOwnerDate: { prefix: "user-42/" } })) {
  console.log(key, (await entry.value).createdAt);
}

// All sessions for user-42 in January 2024
sessions.entries({ byOwnerDate: { prefix: "user-42/2024-01" } })
```

**Important:** Include a separator (like `/`) after each field to prevent partial matches — without it, `"user-4"` would also match `"user-42"`.

## Key Design

Index keys are scanned in **lexicographic (ascending) order**. This section covers patterns for getting the most out of your index key design.

### Pad numbers with leading zeros

Lexicographic sort treats numbers as strings, so `"9"` sorts after `"10"`. Pad numeric values to a fixed width:

```typescript
// Bad: "9" > "10" lexicographically
key: (o) => `${o.priority}`

// Good: "009" < "010"
key: (o) => String(o.priority).padStart(3, "0")
```

### Use ISO dates for chronological order

ISO 8601 strings (`"2024-01-15T10:30:00Z"`) sort correctly as-is — no padding needed.

### Descending order

There is no built-in DESC option. Instead, invert the sort key so that lexicographic ascending order produces the desired descending result.

**For timestamps** — subtract from a far-future epoch and pad to fixed width:

```typescript
const MAX_TS = 8_640_000_000_000; // year 2243

const messages = kv.getStore<Message, undefined, "byNewest">("messages/", {
  byNewest: {
    key: (m) => String(MAX_TS - new Date(m.createdAt).getTime()).padStart(14, "0"),
  },
});

// Most recent messages first
for await (const [key, entry] of messages.entries({ byNewest: { prefix: "" } })) {
  console.log((await entry.value).createdAt);
}
```

**For scores/priorities** — subtract from a known max:

```typescript
const MAX_SCORE = 1_000_000;

const leaderboard = kv.getStore<Player, undefined, "byTopScore">("players/", {
  byTopScore: {
    key: (p) => String(MAX_SCORE - p.score).padStart(7, "0"),
  },
});
```

**Combined with grouping** — composite key with an inverted sort field:

```typescript
const MAX_TS = 8_640_000_000_000;

const sessions = kv.getStore<Session, undefined, "byOwnerNewest">("sessions/", {
  byOwnerNewest: {
    key: (s) => {
      const inv = String(MAX_TS - new Date(s.createdAt).getTime()).padStart(14, "0");
      return `${s.ownerId}/${inv}`;
    },
  },
});

// user-42's most recent sessions first
sessions.entries({ byOwnerNewest: { prefix: "user-42/" } })
```

### Use separators to prevent prefix collisions

Always include a delimiter (typically `/`) between fields in composite keys:

```typescript
// Bad: prefix "user-4" matches "user-4", "user-42", "user-400"
key: (s) => `${s.ownerId}${s.createdAt}`

// Good: prefix "user-4/" only matches user-4
key: (s) => `${s.ownerId}/${s.createdAt}`
```

## Index Maintenance

Indexes are maintained automatically on `set()` and `delete()`. When you update a value, old index entries are removed and new ones are created.

## Reindexing

If indexes are added after data exists, or if index data becomes inconsistent, rebuild indexes with `reindex()`:

```typescript
const result = await docs.reindex();
console.log(result.indexed); // number of entries reindexed
```

## Orphan Handling

Index entries pointing to deleted primary keys are self-healing: they are automatically cleaned up during reads.
