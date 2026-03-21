/**
 * README and docs/ validation tests
 *
 * Ensures documentation stays in sync with the actual codebase:
 * 1. TypeScript examples compile correctly
 * 2. API documentation matches KVLike interface
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "./testing/vitest-compat.js";

const README_PATH = path.join(import.meta.dirname, "..", "README.md");
const DOCS_DIR = path.join(import.meta.dirname, "..", "docs");

function parseMarkdown(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

/**
 * Get all docs/*.md files sorted by name
 */
function getDocFiles(): string[] {
  if (!fs.existsSync(DOCS_DIR)) return [];
  return fs
    .readdirSync(DOCS_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => path.join(DOCS_DIR, f));
}

/**
 * Extract TypeScript code blocks from markdown
 */
function extractTypeScriptBlocks(content: string): string[] {
  const blocks: string[] = [];
  const pattern = /```typescript\n([\s\S]*?)```/g;

  for (const match of content.matchAll(pattern)) {
    blocks.push(match[1]);
  }

  return blocks;
}

/**
 * Rename duplicate const/let declarations to avoid redeclaration errors
 */
function renameDuplicateDeclarations(code: string): string {
  const varCounts = new Map<string, number>();
  return code.replace(
    /\b(const|let)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=/g,
    (match, keyword, varName) => {
      const count = (varCounts.get(varName) || 0) + 1;
      varCounts.set(varName, count);
      if (count > 1) {
        return `${keyword} ${varName}_${count} =`;
      }
      return match;
    },
  );
}

/**
 * Add implied imports and wrap in async IIFE
 */
function addImpliedImports(inputCode: string): string {
  // Rewrite package imports to local path aliases
  let code = inputCode.replace(/"@vercel\/kv2\/testing"/g, '"kv/testing"');
  code = code.replace(/'@vercel\/kv2\/testing'/g, "'kv/testing'");
  code = code.replace(/"@vercel\/kv2"/g, '"kv"');
  code = code.replace(/'@vercel\/kv2'/g, "'kv'");

  // Symbols auto-imported from "kv"
  const kvSymbols = [
    "createKV",
    "KV2",
    "TypedKV",
    "KVVersionConflictError",
    "KVIndexConflictError",
    "noopTracer",
    "consoleTracer",
    "createOtelTracer",
    "createStatsTracer",
    "defineIndexes",
  ];

  // Symbols auto-imported from "kv/testing"
  const testingSymbols = ["FakeBlobStore", "FakeCache", "createTestKV"];

  // Check which symbols are used but not explicitly imported
  const kvNeeded: string[] = [];
  const testingNeeded: string[] = [];

  for (const sym of kvSymbols) {
    if (
      code.includes(sym) &&
      !new RegExp(
        `import\\s*\\{[^}]*\\b${sym}\\b[^}]*\\}\\s*from\\s*["']kv["']`,
      ).test(code) &&
      !new RegExp(`import\\s*\\(\\s*["']kv["']\\s*\\)\\.${sym}`).test(code)
    ) {
      kvNeeded.push(sym);
    }
  }

  for (const sym of testingSymbols) {
    if (
      code.includes(sym) &&
      !new RegExp(
        `import\\s*\\{[^}]*\\b${sym}\\b[^}]*\\}\\s*from\\s*["']kv/testing["']`,
      ).test(code)
    ) {
      testingNeeded.push(sym);
    }
  }

  const imports: string[] = [];
  if (kvNeeded.length > 0) {
    imports.push(`import { ${kvNeeded.join(", ")} } from "kv";`);
  }
  if (testingNeeded.length > 0) {
    imports.push(`import { ${testingNeeded.join(", ")} } from "kv/testing";`);
  }

  // Extract existing imports from code
  const existingImports = code.match(/^import .*/gm) || [];
  const codeWithoutImports = code.replace(/^import .*\n?/gm, "").trim();

  // Combine all imports (existing first, then implied)
  const allImports = [...existingImports, ...imports];

  // Rename duplicate variable declarations
  const scopedCode = renameDuplicateDeclarations(codeWithoutImports);

  // Wrap non-import code in async IIFE
  const wrappedCode = `(async () => {\n${scopedCode}\n})();`;

  if (allImports.length === 0) {
    return wrappedCode;
  }

  return `${allImports.join("\n")}\n\n${wrappedCode}`;
}

/**
 * Compile TypeScript blocks in a single tsc invocation
 */
function compileTypeScriptBlocks(
  blocks: string[],
  filePrefix = "example",
): void {
  const tmpDir = path.join(import.meta.dirname, "..", ".docs-test-tmp");
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    const files: string[] = [];

    // Write all blocks to files
    for (let i = 0; i < blocks.length; i++) {
      const code = addImpliedImports(blocks[i]);
      const fileName = `${filePrefix}-${i}.ts`;
      const filePath = path.join(tmpDir, fileName);
      fs.writeFileSync(filePath, code);
      files.push(filePath);
    }

    if (files.length === 0) return;

    // Create ephemeral type definitions for types assumed in examples
    const ephemeralTypes = `
// Types commonly used in README and docs examples
interface User {
  name: string;
  email: string;
}

interface Post {
  title: string;
  content: string;
}

interface Metadata {
  updatedAt: number;
  version: number;
}

interface Board {
  name: string;
}

interface Column {
  name: string;
  order: number;
}

interface Task {
  title: string;
  done: boolean;
}

// Doc-specific types
interface Doc {
  slug: string;
  status: string;
  tags: string[];
  title: string;
  content: string;
  authorId: string;
}

// Ambient variables for examples that don't define their own
declare const kv: import("kv").KV2<any>;
declare const users: import("kv").TypedKV<User, any>;
declare const posts: import("kv").TypedKV<Post, any>;
declare const docs: import("kv").TypedKV<Doc, any, "bySlug" | "byStatus" | "byTag">;
declare const metadata: any;
declare const userData: any;
declare const entry: import("kv").KVEntry<any, any>;
declare const newValue: any;
declare const docData: Doc;
`;
    fs.writeFileSync(path.join(tmpDir, "example-types.d.ts"), ephemeralTypes);

    // Create tsconfig for type checking
    const tsconfig = {
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        esModuleInterop: true,
        paths: {
          kv: [path.join(import.meta.dirname, "index.ts")],
          "kv/testing": [path.join(import.meta.dirname, "testing", "index.ts")],
        },
      },
      include: [...files, path.join(tmpDir, "example-types.d.ts")],
    };
    fs.writeFileSync(
      path.join(tmpDir, "tsconfig.json"),
      JSON.stringify(tsconfig, null, 2),
    );

    // Run tsc to check all files
    try {
      execSync("npx tsc --project tsconfig.json", {
        cwd: tmpDir,
        encoding: "utf-8",
        stdio: "pipe",
      });
    } catch (error) {
      const execError = error as { stdout?: string; stderr?: string };
      const output = execError.stdout || execError.stderr || "";

      // Parse errors
      const errorLines = output
        .split("\n")
        .filter((line) => line.includes("error TS"));

      if (errorLines.length > 0) {
        throw new Error(
          `TypeScript errors in ${filePrefix} examples:\n${errorLines.slice(0, 10).join("\n")}${errorLines.length > 10 ? `\n... and ${errorLines.length - 10} more` : ""}`,
        );
      }
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

describe("README validation", () => {
  it("should have TypeScript code blocks", () => {
    const readme = parseMarkdown(README_PATH);
    const blocks = extractTypeScriptBlocks(readme);
    expect(blocks.length).toBeGreaterThan(0);
  });

  it("should document KVLike interface methods", () => {
    const readme = parseMarkdown(README_PATH);

    const requiredMethods = [
      "get",
      "getValue",
      "set",
      "delete",
      "keys",
      "entries",
      "getMany",
    ];
    for (const method of requiredMethods) {
      expect(readme).toContain(method);
    }
  });

  it("should document createKV options", () => {
    const readme = parseMarkdown(README_PATH);

    expect(readme).toContain("prefix");
  });

  it("should have valid TypeScript syntax in all examples", () => {
    const readme = parseMarkdown(README_PATH);
    const blocks = extractTypeScriptBlocks(readme);
    compileTypeScriptBlocks(blocks, "readme-example");
  });
});

describe("docs/ validation", () => {
  const docFiles = getDocFiles();

  it("should have doc files", () => {
    expect(docFiles.length).toBeGreaterThan(0);
  });

  for (const docFile of docFiles) {
    const basename = path.basename(docFile);

    it(`${basename} should have valid markdown`, () => {
      const content = parseMarkdown(docFile);
      expect(content.length).toBeGreaterThan(0);
    });

    it(`${basename} should have valid TypeScript syntax`, () => {
      const content = parseMarkdown(docFile);
      const blocks = extractTypeScriptBlocks(content);
      if (blocks.length > 0) {
        compileTypeScriptBlocks(blocks, `doc-${basename.replace(".md", "")}`);
      }
    });
  }
});
