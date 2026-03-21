// Load environment variables from .env.local before anything else
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import fs from "node:fs";
import path from "node:path";
import { printTimingStats, useRealBlobStore, validateIntegrationTestEnv, } from "./index.js";
import { runTests } from "./vitest-compat.js";
/**
 * Finds all *.test.ts files in src/ directory recursively.
 */
function findTestFiles(dir) {
    const results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== "node_modules") {
            results.push(...findTestFiles(fullPath));
        }
        else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
            results.push(fullPath);
        }
    }
    return results;
}
/**
 * Extracts imported test file paths from test-index.ts content.
 */
function extractImportedTests(indexContent) {
    const imports = new Set();
    const importRegex = /import\s+["']([^"']+\.test\.js)["']/g;
    for (const match of indexContent.matchAll(importRegex)) {
        // Convert ./foo.test.js to foo.test.ts
        const importPath = match[1].replace(/\.js$/, ".ts");
        imports.add(importPath);
    }
    return imports;
}
/**
 * Checks that all test files are imported in test-index.ts.
 * Only runs when VERCEL_ENV is not set (local development).
 */
function checkAllTestsImported() {
    if (process.env.VERCEL_ENV) {
        return; // Skip on Vercel deployments
    }
    // import.meta.url points to dist/testing/, we need src/testing/
    const distTestingDir = path.dirname(new URL(import.meta.url).pathname);
    const projectRoot = path.dirname(path.dirname(distTestingDir)); // Go up from dist/testing/ to project root
    const srcDir = path.join(projectRoot, "src");
    const testIndexPath = path.join(srcDir, "testing", "test-index.ts");
    // Find all test files
    const allTestFiles = findTestFiles(srcDir);
    // Read test-index.ts and extract imports
    const indexContent = fs.readFileSync(testIndexPath, "utf-8");
    const importedTests = extractImportedTests(indexContent);
    // Normalize paths relative to test-index.ts location
    const testIndexDir = path.dirname(testIndexPath);
    const missingTests = [];
    for (const testFile of allTestFiles) {
        // Skip test-index.ts itself and vitest-compat tests
        if (testFile.includes("test-index") || testFile.includes("vitest-compat")) {
            continue;
        }
        // Convert absolute path to relative import path from test-index.ts
        const relativePath = path.relative(testIndexDir, testFile);
        const importPath = relativePath.startsWith(".")
            ? relativePath
            : `./${relativePath}`;
        // Normalize for comparison (../ prefix for files in parent dir)
        const normalizedImport = importPath.replace(/\\/g, "/");
        if (!importedTests.has(normalizedImport)) {
            missingTests.push(testFile);
        }
    }
    if (missingTests.length > 0) {
        console.error("\x1b[31m=== Missing Test Imports ===\x1b[0m");
        console.error("The following test files are not imported in test-index.ts:");
        for (const file of missingTests) {
            console.error(`  - ${path.relative(srcDir, file)}`);
        }
        console.error("\nAdd them to src/testing/test-index.ts");
        process.exit(1);
    }
}
// Check all tests are imported (local dev only)
checkAllTestsImported();
// Validate env vars before loading tests
validateIntegrationTestEnv();
import "./test-index.js";
// Support filtering: `pnpm test -- <filter>`
// Matches against the full test name (suite > test name).
const filter = process.argv.filter((a) => a !== "--").slice(2)[0] || undefined;
if (filter) {
    console.log(`\x1b[36mFilter: ${filter}\x1b[0m\n`);
}
// All tests use isolated context, safe for concurrent execution.
const concurrency = 30;
const results = await runTests({
    filter,
    concurrency,
    keepAliveInterval: 5000, // 5 seconds
    onKeepAlive: (testName, elapsedMs) => {
        const elapsedSec = Math.floor(elapsedMs / 1000);
        console.log(`\x1b[33m⏳ [${elapsedSec}s] Still running: ${testName}\x1b[0m`);
    },
    onProgress: (result) => {
        const suitePath = result.suite.join(" > ");
        const fullName = suitePath ? `${suitePath} > ${result.name}` : result.name;
        const status = result.passed
            ? "\x1b[32m✓ PASS\x1b[0m"
            : "\x1b[31m✗ FAIL\x1b[0m";
        console.log(`${status} ${fullName} (${result.duration}ms)`);
        if (!result.passed && result.error) {
            console.log(`  \x1b[31m${result.error}\x1b[0m`);
        }
    },
});
console.log("\n=== Test Results ===");
console.log("Total:", results.total);
console.log("\x1b[32mPassed:", results.passed, "\x1b[0m");
if (results.failed > 0) {
    console.log("\x1b[31mFailed:", results.failed, "\x1b[0m");
}
const failures = results.results.filter((r) => !r.passed);
if (failures.length > 0) {
    console.log("\n=== FAILURES ===");
    for (const f of failures) {
        const suitePath = f.suite.join(" > ");
        const fullName = suitePath ? `${suitePath} > ${f.name}` : f.name;
        console.log(`\x1b[31m✗ FAIL ${fullName}\x1b[0m`);
        if (f.error) {
            console.log(`  ${f.error}`);
        }
    }
}
// Print timing stats for integration tests
if (useRealBlobStore()) {
    printTimingStats();
}
process.exit(results.failed > 0 ? 1 : 0);
//# sourceMappingURL=run-tests.js.map