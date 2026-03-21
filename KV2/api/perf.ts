// Performance comparison: raw blob access vs cached reads
process.env.INTEGRATION_TEST = "1";

import { runPerfTest } from "../src/testing/perf-test.js";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const iterations = Number.parseInt(
    url.searchParams.get("iterations") || "50",
    10,
  );

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const write = (text: string) => {
        controller.enqueue(encoder.encode(`${text}\n`));
      };

      write("Running performance comparison test...");
      write(`(${iterations} iterations per test)\n`);

      try {
        const result = await runPerfTest(iterations);
        write(result.summary);
      } catch (err) {
        write(`\nError: ${err instanceof Error ? err.message : String(err)}`);
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
