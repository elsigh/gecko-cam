#!/usr/bin/env node

// Optional dotenv for local development
try {
  const dotenv = await import("dotenv");
  dotenv.config({ path: ".env.local", quiet: true });
} catch {
  // dotenv not installed, skip
}

import { createInterface } from "node:readline/promises";
import { createKV } from "./create-kv.js";
import type { KVLike } from "./types.js";

// ---------------------------------------------------------------------------
// ANSI helpers (only when stderr is a TTY)
// ---------------------------------------------------------------------------
const isTTY = process.stderr.isTTY ?? false;
const dim = (s: string) => (isTTY ? `\x1b[2m${s}\x1b[0m` : s);
const bold = (s: string) => (isTTY ? `\x1b[1m${s}\x1b[0m` : s);
const red = (s: string) => (isTTY ? `\x1b[31m${s}\x1b[0m` : s);
const green = (s: string) => (isTTY ? `\x1b[32m${s}\x1b[0m` : s);

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

function consumeFlag(name: string): boolean {
  const idx = args.indexOf(name);
  if (idx === -1) return false;
  args.splice(idx, 1);
  return true;
}

function consumeOption(name: string, fallback: string): string {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return fallback;
  const value = args[idx + 1];
  args.splice(idx, 2);
  return value ?? fallback;
}

const allowWrites = consumeFlag("--allow-writes");
const verbose = consumeFlag("--verbose");
const allKeys = consumeFlag("--all");
const prefix = consumeOption("--prefix", "");
const env = consumeOption("--env", process.env.VERCEL_ENV ?? "development");
const branch = consumeOption(
  "--branch",
  process.env.VERCEL_GIT_COMMIT_REF || "main",
);
const limitStr = consumeOption("--limit", "100");
const limit = Number.parseInt(limitStr, 10) || 100;

// Remaining args are the command + its arguments
const [command, ...commandArgs] = args;

// ---------------------------------------------------------------------------
// KV init (lazy — deferred until first command that needs it)
// ---------------------------------------------------------------------------
let _kv: KVLike<unknown> | undefined;
function kv(): KVLike<unknown> {
  if (!_kv) {
    _kv = createKV({
      prefix: prefix || undefined,
      env,
      branch,
    });
  }
  return _kv;
}

// ---------------------------------------------------------------------------
// Quote-aware tokenizer for REPL input
// ---------------------------------------------------------------------------
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuote: "'" | '"' | null = null;

  for (const ch of input) {
    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null;
      } else {
        current += ch;
      }
    } else if (ch === "'" || ch === '"') {
      inQuote = ch;
    } else if (ch === " " || ch === "\t") {
      if (current) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

// ---------------------------------------------------------------------------
// Command implementations
// ---------------------------------------------------------------------------

async function cmdKeys(prefixArg?: string): Promise<void> {
  if (allKeys) {
    let count = 0;
    for await (const key of kv().keys(prefixArg)) {
      process.stdout.write(`${key}\n`);
      count++;
    }
    process.stderr.write(`${dim(`${count} key(s)`)}\n`);
    return;
  }

  const keysIterable = kv().keys(prefixArg);
  const result = await keysIterable.page(limit);
  for (const key of result.keys) {
    process.stdout.write(`${key}\n`);
  }
  if (result.cursor) {
    process.stderr.write(
      `${dim(`${result.keys.length} key(s) (more available, use --all or --limit)`)}\n`,
    );
  } else {
    process.stderr.write(`${dim(`${result.keys.length} key(s)`)}\n`);
  }
}

async function cmdGet(key: string): Promise<void> {
  if (!key) {
    process.stderr.write(`${red("Usage: get <key>")}\n`);
    process.exitCode = 1;
    return;
  }

  const result = await kv().get(key);
  if (!result.exists) {
    process.stderr.write(`${red(`Key not found: ${key}`)}\n`);
    process.exitCode = 1;
    return;
  }

  const value = await result.value;

  if (verbose) {
    process.stderr.write(`${dim(`key:      ${key}`)}\n`);
    process.stderr.write(`${dim(`version:  ${result.version}`)}\n`);
    if (result.metadata !== undefined) {
      process.stderr.write(
        `${dim(`metadata: ${JSON.stringify(result.metadata)}`)}\n`,
      );
    }
  }

  if (value instanceof ReadableStream || value instanceof ArrayBuffer) {
    // Binary value
    if (value instanceof ReadableStream) {
      let size = 0;
      const reader = value.getReader();
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        size += chunk.byteLength;
      }
      process.stdout.write(`<binary, ${size} bytes>\n`);
    } else {
      process.stdout.write(`<binary, ${value.byteLength} bytes>\n`);
    }
  } else {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  }
}

async function cmdSet(
  key: string,
  jsonValue: string,
  metadataJson?: string,
): Promise<void> {
  if (!key || jsonValue === undefined) {
    process.stderr.write(`${red("Usage: set <key> <json> [metadata-json]")}\n`);
    process.exitCode = 1;
    return;
  }

  if (!allowWrites) {
    process.stderr.write(
      `${red("Write operations require --allow-writes flag")}\n`,
    );
    process.exitCode = 1;
    return;
  }

  let value: unknown;
  try {
    value = JSON.parse(jsonValue);
  } catch {
    process.stderr.write(`${red(`Invalid JSON value: ${jsonValue}`)}\n`);
    process.exitCode = 1;
    return;
  }

  let metadata: unknown;
  if (metadataJson) {
    try {
      metadata = JSON.parse(metadataJson);
    } catch {
      process.stderr.write(
        `${red(`Invalid JSON metadata: ${metadataJson}`)}\n`,
      );
      process.exitCode = 1;
      return;
    }
  }

  const result = await kv().set(key, value, metadata);
  process.stderr.write(`${green(`Set ${key} (version: ${result.version})`)}\n`);
}

async function cmdDel(key: string): Promise<void> {
  if (!key) {
    process.stderr.write(`${red("Usage: del <key>")}\n`);
    process.exitCode = 1;
    return;
  }

  if (!allowWrites) {
    process.stderr.write(
      `${red("Write operations require --allow-writes flag")}\n`,
    );
    process.exitCode = 1;
    return;
  }

  await kv().delete(key);
  process.stderr.write(`${green(`Deleted ${key}`)}\n`);
}

function printHelp(): void {
  const text = `
${bold("KV CLI Explorer")}

${bold("Usage:")}
  kv2 [options] [command] [args...]
  kv2 [options]                       ${dim("# interactive REPL")}

${bold("Commands:")}
  keys [prefix]                List keys (one per line)
  get <key>                    Print JSON value to stdout
  set <key> <json> [metadata]  Set a value (requires --allow-writes)
  del <key>                    Delete a key (requires --allow-writes)
  help                         Show this help

${bold("Options:")}
  --prefix <prefix>    Key prefix (e.g. "myapp/")
  --env <env>          Override VERCEL_ENV (default: development)
  --branch <branch>    Override VERCEL_GIT_COMMIT_REF (default: main)
  --limit <n>          Max keys to list (default: 100)
  --all                List all keys (no limit)
  --allow-writes       Enable write operations (set, del)
  --verbose            Show metadata and version on get

${bold("Note:")} The blob path is cached-kv/{env}/{branch}/{prefix}{key}.value.
If your app uses a prefix (e.g. createKV({ prefix: "myapp/" })),
you must pass --prefix myapp/ to the CLI to see those keys.

${bold("Examples:")}
  kv2 keys                             ${dim("# list keys (first 100)")}
  kv2 keys users/                      ${dim("# list keys under users/")}
  kv2 --all keys                       ${dim("# list all keys")}
  kv2 --limit 500 keys                 ${dim("# list first 500 keys")}
  kv2 get users/alice                  ${dim("# print value as JSON")}
  kv2 --verbose get users/alice        ${dim("# also show version/metadata")}
  kv2 --allow-writes set foo '{"a":1}' ${dim("# set a value")}
  kv2 --allow-writes del foo           ${dim("# delete a key")}
  kv2 keys | wc -l                     ${dim("# pipe-friendly stdout")}
  kv2                                  ${dim("# interactive REPL")}
`;
  process.stderr.write(`${text.trim()}\n`);
}

// ---------------------------------------------------------------------------
// Command dispatch
// ---------------------------------------------------------------------------
async function dispatch(cmd: string, cmdArgs: string[]): Promise<void> {
  switch (cmd) {
    case "keys":
      await cmdKeys(cmdArgs[0]);
      break;
    case "get":
      await cmdGet(cmdArgs[0] ?? "");
      break;
    case "set":
      await cmdSet(cmdArgs[0] ?? "", cmdArgs[1] ?? "", cmdArgs[2]);
      break;
    case "del":
    case "delete":
      await cmdDel(cmdArgs[0] ?? "");
      break;
    case "help":
      printHelp();
      break;
    default:
      process.stderr.write(`${red(`Unknown command: ${cmd}`)}\n`);
      printHelp();
      process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// REPL mode
// ---------------------------------------------------------------------------
async function repl(): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  process.stderr.write(`\n${bold("KV CLI Explorer")}\n`);
  process.stderr.write(`${dim(`  env:     ${env}`)}\n`);
  process.stderr.write(`${dim(`  branch:  ${branch}`)}\n`);
  process.stderr.write(`${dim(`  prefix:  ${prefix || "(none)"}`)}\n`);
  process.stderr.write(
    `${dim(`  writes:  ${allowWrites ? "enabled" : "disabled"}`)}\n`,
  );
  process.stderr.write(
    `${dim('  Type "help" for commands, Ctrl+C to exit.')}\n\n`,
  );

  while (true) {
    let line: string;
    try {
      line = await rl.question("kv2> ");
    } catch {
      // EOF or Ctrl+C
      break;
    }

    const trimmed = line.trim();
    if (!trimmed) continue;

    const tokens = tokenize(trimmed);
    const [replCmd, ...replArgs] = tokens;
    if (!replCmd) continue;

    if (replCmd === "exit" || replCmd === "quit") break;

    try {
      await dispatch(replCmd, replArgs);
    } catch (err) {
      process.stderr.write(
        `${red(`Error: ${err instanceof Error ? err.message : String(err)}`)}\n`,
      );
    }
    // Reset exitCode between REPL commands
    process.exitCode = 0;
  }

  rl.close();
  process.stderr.write("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  if (!command) {
    // No command -> interactive REPL
    await repl();
    return;
  }

  if (command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  try {
    await dispatch(command, commandArgs);
  } catch (err) {
    process.stderr.write(
      `${red(`Error: ${err instanceof Error ? err.message : String(err)}`)}\n`,
    );
    process.exitCode = 1;
  }
}

main();
