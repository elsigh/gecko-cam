import { spawnSync } from "node:child_process";
import { describe, expect, it } from "./testing/vitest-compat.js";
const CLI_PATH = new URL("../dist/cli.js", import.meta.url).pathname;
function run(args, envOverrides) {
    const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
        env: {
            ...process.env,
            // Prevent dotenv from injecting real tokens in test
            BLOB_READ_WRITE_TOKEN: "",
            VERCEL_ENV: "",
            VERCEL_GIT_COMMIT_REF: "",
            ...envOverrides,
        },
        timeout: 10_000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
    });
    return {
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        exitCode: result.status ?? 1,
    };
}
describe("CLI", () => {
    describe("help", () => {
        it("shows help with 'help' command", () => {
            const { stderr, exitCode } = run(["help"]);
            expect(exitCode).toBe(0);
            expect(stderr).toContain("KV CLI Explorer");
            expect(stderr).toContain("Commands:");
            expect(stderr).toContain("keys [prefix]");
            expect(stderr).toContain("get <key>");
            expect(stderr).toContain("set <key>");
            expect(stderr).toContain("del <key>");
            expect(stderr).toContain("--prefix");
            expect(stderr).toContain("--allow-writes");
            expect(stderr).toContain("--verbose");
        });
        it("shows help with --help flag", () => {
            const { stderr, exitCode } = run(["--help"]);
            expect(exitCode).toBe(0);
            expect(stderr).toContain("KV CLI Explorer");
        });
        it("shows help with -h flag", () => {
            const { stderr, exitCode } = run(["-h"]);
            expect(exitCode).toBe(0);
            expect(stderr).toContain("KV CLI Explorer");
        });
        it("prints nothing to stdout for help", () => {
            const { stdout } = run(["help"]);
            expect(stdout).toBe("");
        });
    });
    describe("unknown command", () => {
        it("rejects unknown commands", () => {
            const { stderr, exitCode } = run(["bogus"]);
            expect(exitCode).toBe(1);
            expect(stderr).toContain("Unknown command: bogus");
        });
        it("shows help after unknown command", () => {
            const { stderr } = run(["bogus"]);
            expect(stderr).toContain("Commands:");
        });
        it("prints nothing to stdout for unknown command", () => {
            const { stdout } = run(["bogus"]);
            expect(stdout).toBe("");
        });
    });
    describe("write guards", () => {
        it("rejects set without --allow-writes", () => {
            const { stderr, exitCode } = run(["set", "foo", '{"a":1}']);
            expect(exitCode).toBe(1);
            expect(stderr).toContain("--allow-writes");
        });
        it("rejects del without --allow-writes", () => {
            const { stderr, exitCode } = run(["del", "foo"]);
            expect(exitCode).toBe(1);
            expect(stderr).toContain("--allow-writes");
        });
        it("prints nothing to stdout when writes rejected", () => {
            const { stdout } = run(["set", "foo", '{"a":1}']);
            expect(stdout).toBe("");
        });
    });
    describe("argument validation", () => {
        it("rejects get without key", () => {
            const { stderr, exitCode } = run(["get"]);
            expect(exitCode).toBe(1);
            expect(stderr).toContain("Usage: get <key>");
        });
        it("rejects set without key", () => {
            const { stderr, exitCode } = run(["--allow-writes", "set"]);
            expect(exitCode).toBe(1);
            expect(stderr).toContain("Usage: set");
        });
        it("rejects set without value", () => {
            const { stderr, exitCode } = run(["--allow-writes", "set", "foo"]);
            expect(exitCode).toBe(1);
            expect(stderr).toContain("Invalid JSON value");
        });
        it("rejects del without key", () => {
            const { stderr, exitCode } = run(["--allow-writes", "del"]);
            expect(exitCode).toBe(1);
            expect(stderr).toContain("Usage: del <key>");
        });
        it("rejects set with invalid JSON value", () => {
            const { stderr, exitCode } = run([
                "--allow-writes",
                "set",
                "foo",
                "not-json",
            ]);
            expect(exitCode).toBe(1);
            expect(stderr).toContain("Invalid JSON value");
        });
        it("rejects set with invalid JSON metadata", () => {
            const { stderr, exitCode } = run([
                "--allow-writes",
                "set",
                "foo",
                '{"a":1}',
                "not-json",
            ]);
            expect(exitCode).toBe(1);
            expect(stderr).toContain("Invalid JSON metadata");
        });
    });
    describe("option parsing", () => {
        it("parses --prefix before command", () => {
            const { stderr, exitCode } = run(["--prefix", "myapp/", "help"]);
            expect(exitCode).toBe(0);
            expect(stderr).toContain("KV CLI Explorer");
        });
        it("parses --env before command", () => {
            const { stderr, exitCode } = run(["--env", "production", "help"]);
            expect(exitCode).toBe(0);
            expect(stderr).toContain("KV CLI Explorer");
        });
        it("parses --branch before command", () => {
            const { stderr, exitCode } = run(["--branch", "main", "help"]);
            expect(exitCode).toBe(0);
            expect(stderr).toContain("KV CLI Explorer");
        });
        it("parses multiple options together", () => {
            const { stderr, exitCode } = run([
                "--prefix",
                "app/",
                "--env",
                "staging",
                "--branch",
                "dev",
                "--verbose",
                "help",
            ]);
            expect(exitCode).toBe(0);
            expect(stderr).toContain("KV CLI Explorer");
        });
        it("options work after command too", () => {
            const { stderr } = run(["del", "foo", "--allow-writes"]);
            // --allow-writes is consumed during option parsing regardless of position
            expect(stderr).not.toContain("require --allow-writes");
        });
    });
    describe("stdout/stderr contract", () => {
        it("help output goes only to stderr", () => {
            const { stdout, stderr } = run(["help"]);
            expect(stdout).toBe("");
            expect(stderr.length).toBeGreaterThan(0);
        });
        it("errors go only to stderr", () => {
            const { stdout, stderr } = run(["bogus"]);
            expect(stdout).toBe("");
            expect(stderr).toContain("Unknown command");
        });
        it("write guard errors go only to stderr", () => {
            const { stdout, stderr } = run(["set", "k", '{"v":1}']);
            expect(stdout).toBe("");
            expect(stderr).toContain("--allow-writes");
        });
        it("validation errors go only to stderr", () => {
            const { stdout, stderr } = run(["get"]);
            expect(stdout).toBe("");
            expect(stderr).toContain("Usage");
        });
    });
    describe("delete alias", () => {
        it("'delete' works as alias for 'del'", () => {
            const delResult = run(["del", "foo"]);
            const deleteResult = run(["delete", "foo"]);
            expect(delResult.stderr).toContain("--allow-writes");
            expect(deleteResult.stderr).toContain("--allow-writes");
            expect(delResult.exitCode).toBe(deleteResult.exitCode);
        });
    });
    if (process.env.INTEGRATION_TEST === "1") {
        describe("data operations (integration)", () => {
            const testKey = `cli-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const tokenEnv = {
                BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN ?? "",
            };
            const baseArgs = ["--env", "development", "--branch", "cli-test"];
            it("set writes a value", () => {
                const { stderr, exitCode } = run(["--allow-writes", ...baseArgs, "set", testKey, '{"hello":"world"}'], tokenEnv);
                expect(exitCode).toBe(0);
                expect(stderr).toContain(`Set ${testKey}`);
                expect(stderr).toContain("version:");
            });
            it("get reads the value back", () => {
                const { stdout, exitCode } = run([...baseArgs, "get", testKey], tokenEnv);
                expect(exitCode).toBe(0);
                const parsed = JSON.parse(stdout.trim());
                expect(parsed.hello).toBe("world");
            });
            it("get --verbose shows metadata on stderr", () => {
                const { stdout, stderr, exitCode } = run(["--verbose", ...baseArgs, "get", testKey], tokenEnv);
                expect(exitCode).toBe(0);
                expect(stderr).toContain("key:");
                expect(stderr).toContain("version:");
                const parsed = JSON.parse(stdout.trim());
                expect(parsed.hello).toBe("world");
            });
            it("keys lists the key", () => {
                const { stdout, stderr, exitCode } = run([...baseArgs, "keys"], tokenEnv);
                expect(exitCode).toBe(0);
                expect(stdout).toContain(testKey);
                expect(stderr).toContain("key(s)");
            });
            it("get returns error for missing key", () => {
                const { stdout, stderr, exitCode } = run([...baseArgs, "get", "nonexistent-key-xyz"], tokenEnv);
                expect(exitCode).toBe(1);
                expect(stdout).toBe("");
                expect(stderr).toContain("Key not found");
            });
            it("del deletes the key", () => {
                const { stderr, exitCode } = run(["--allow-writes", ...baseArgs, "del", testKey], tokenEnv);
                expect(exitCode).toBe(0);
                expect(stderr).toContain(`Deleted ${testKey}`);
            });
        });
    }
});
//# sourceMappingURL=cli.test.js.map