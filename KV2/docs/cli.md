[Home](../README.md) | [Previous: Testing and Tracing](testing-and-tracing.md) | [Next: API Reference](api-reference.md)

# CLI Explorer

An interactive command-line tool for exploring and manipulating KV stores. Read-only by default; pass `--allow-writes` to enable mutations.

## Installation

The package exposes a `kv2` binary. After installing:

```bash
npx kv2 help
```

Or add it as a dev dependency and run via your package manager:

```bash
npm install -D @vercel/kv2
npx kv2 keys
```

## Usage

```bash
kv2 [options] [command] [args...]
kv2 [options]                        # interactive REPL
```

```bash
# One-shot commands
kv2 keys                                # List keys (first 100)
kv2 keys users/                         # List keys under a prefix
kv2 --all keys                          # List all keys
kv2 --limit 500 keys                    # List first 500 keys
kv2 get users/alice                     # Print value as JSON to stdout
kv2 --verbose get users/alice           # Also show version/metadata on stderr
kv2 --allow-writes set foo '{"a":1}'    # Set a value
kv2 --allow-writes del foo              # Delete a key

# Interactive REPL
kv2                                     # Launches kv2> prompt
```

## Commands

| Command | Description | Writes? |
|---------|-------------|---------|
| `keys [prefix]` | List keys, one per line | No |
| `get <key>` | Print JSON value to stdout | No |
| `set <key> <json> [metadata-json]` | Set a value | Yes |
| `del <key>` | Delete a key | Yes |
| `help` | Show usage | No |

Write commands (`set`, `del`) are rejected unless `--allow-writes` is passed.

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--prefix <prefix>` | Key prefix passed to `createKV()` | _(none)_ |
| `--env <env>` | Override `VERCEL_ENV` | `development` |
| `--branch <branch>` | Override `VERCEL_GIT_COMMIT_REF` | `local` |
| `--limit <n>` | Max keys to list | `100` |
| `--all` | List all keys (no limit) | _(disabled)_ |
| `--allow-writes` | Enable write operations | _(disabled)_ |
| `--verbose` | Show metadata and version on `get` | _(disabled)_ |

## Prefix matters

The blob path structure is `cached-kv/{env}/{branch}/{prefix}{key}.value`. If your app uses `createKV({ prefix: "myapp/" })`, the CLI must use `--prefix myapp/` to see those keys:

```bash
kv2 --prefix myapp/ keys
kv2 --prefix myapp/ get users/alice
```

## stdout / stderr contract

In one-shot mode, stdout contains only data (for piping) and stderr contains everything else (status, colors, errors).

| Command | stdout | stderr |
|---------|--------|--------|
| `keys` | one key per line | `N key(s)` count |
| `get` | JSON value (pretty-printed) | key, version, metadata (with `--verbose`) |
| `get` (not found) | _(nothing)_ | "Key not found: X" |
| `set` | _(nothing)_ | "Set X (version: ...)" |
| `del` | _(nothing)_ | "Deleted X" |

This enables piping:

```bash
kv2 keys | wc -l                          # Count keys
kv2 get users/alice | jq .name            # Extract field
kv2 keys | xargs -I{} kv2 get {}          # Dump all values
```

## Interactive REPL

Running `kv2` without a command launches an interactive REPL. On startup it prints the current context:

```
KV CLI Explorer
  env:     development
  branch:  local
  prefix:  (none)
  writes:  disabled
  Type "help" for commands, Ctrl+C to exit.

kv2> keys
kv2> get users/alice
kv2> exit
```

The same commands work in REPL mode. Type `exit`, `quit`, or press Ctrl+C to leave.

## Environment

The CLI automatically loads `.env.local` via dotenv (if installed). You can also export `BLOB_READ_WRITE_TOKEN` directly:

```bash
export BLOB_READ_WRITE_TOKEN=vercel_blob_...
kv2 keys
```
