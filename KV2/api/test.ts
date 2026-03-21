// Always run in integration test mode when accessed via API
process.env.INTEGRATION_TEST = "1";

import { printTimingStats } from "../src/testing/index.js";
import { type TestResult, runTests } from "../src/testing/vitest-compat.js";

// Import all test files to register them
import "../src/testing/test-index.js";

// API Handler - streams same output as `pnpm test:integration`
export async function GET(): Promise<Response> {
  const encoder = new TextEncoder();

  // Capture console.log to stream
  const originalLog = console.log;
  let controller: ReadableStreamDefaultController<Uint8Array>;

  const stream = new ReadableStream({
    async start(ctrl) {
      controller = ctrl;

      // Redirect console.log to stream
      console.log = (...args: unknown[]) => {
        const text = args
          .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
          .join(" ");
        controller.enqueue(encoder.encode(`${text}\n`));
        originalLog.apply(console, args);
      };

      try {
        const result = await runTests({
          concurrency: 10,
          keepAliveInterval: 5000,
          onKeepAlive: (testName: string, elapsedMs: number) => {
            const elapsedSec = Math.floor(elapsedMs / 1000);
            console.log(`⏳ [${elapsedSec}s] Still running: ${testName}`);
          },
          onProgress: (testResult: TestResult) => {
            const suitePath = testResult.suite.join(" > ");
            const fullName = suitePath
              ? `${suitePath} > ${testResult.name}`
              : testResult.name;
            const status = testResult.passed ? "✓ PASS" : "✗ FAIL";
            console.log(`${status} ${fullName} (${testResult.duration}ms)`);
            if (!testResult.passed && testResult.error) {
              console.log(`  ${testResult.error}`);
            }
          },
        });

        console.log("\n=== Test Results ===");
        console.log("Total:", result.total);
        console.log("Passed:", result.passed);
        if (result.failed > 0) {
          console.log("Failed:", result.failed);
        }

        const failures = result.results.filter((r) => !r.passed);
        if (failures.length > 0) {
          console.log("\n=== FAILURES ===");
          for (const f of failures) {
            const suitePath = f.suite.join(" > ");
            const fullName = suitePath ? `${suitePath} > ${f.name}` : f.name;
            console.log(`✗ FAIL ${fullName}`);
            if (f.error) {
              console.log(`  ${f.error}`);
            }
          }
        }

        // Print timing stats (same as CLI)
        printTimingStats();
      } finally {
        console.log = originalLog;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
