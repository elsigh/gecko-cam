# CachedKV CRUD Example

A Next.js 16 application with shadcn/ui that demonstrates CRUD operations on a CachedKV store.

## Features

- **List View**: Browse all entries in a sortable table with search
- **Tree View**: Navigate hierarchical keys (using `/` as separator) in a folder-like tree structure
- **Create**: Add new key-value entries with optional metadata
- **Read**: View entry values and metadata in JSON format
- **Update**: Modify existing entries
- **Delete**: Remove entries with confirmation dialog

## Getting Started

1. Create a `.env.local` file:

```bash
BLOB_READ_WRITE_TOKEN=your_vercel_blob_token
```

2. Get your token from the [Vercel Dashboard](https://vercel.com/dashboard/stores)

3. Run the app:

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to use the app.

## Key Organization

Use forward slashes (`/`) to organize keys hierarchically:

```
users/alice/profile
users/alice/settings
users/bob/profile
config/app
config/features
```

This creates a tree structure that's easy to navigate in the Tree View.

## Tech Stack

- [Next.js 16](https://nextjs.org/) - React framework
- [shadcn/ui](https://ui.shadcn.com/) - UI components
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [CachedKV](../../README.md) - Key-value store with caching
