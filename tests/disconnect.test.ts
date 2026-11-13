import { describe, test, beforeEach } from "node:test";
import assert from "node:assert";
import { Response } from "node-fetch";

import { handleDisconnect } from "../src/disconnect.js";
import registry from "../src/registry.js";
import Pipeline from "../src/pipeline.js";
import Platform from "../src/platform.js";
import processor from "../src/processor.js";

const mockPlatform: Platform = {
  fetch: {} as any,
  log: () => {},
  logs: () => {},
  trace: () => {},
  warn: () => {},
  error: () => {},
};

const createMockPipeline = (id: string, name: string, hasRetryEvent: boolean = false): Pipeline =>
  ({
    id,
    name,
    status: 0,
    steps: [],
    events: hasRetryEvent
      ? {
          retry: {
            method: "POST",
            endpoint: "http://example.com/retry",
          },
        }
      : undefined,
  }) as Pipeline;

describe("disconnect", () => {
  beforeEach(() => {
    // Clear all pipelines before each test
    const all = registry.getAll();
    for (const id of all.keys()) {
      registry.unregister(id);
    }
  });

  describe("handleDisconnect", () => {
    test("should log warning when client disconnects", async () => {
      const warnMessages: string[] = [];
      const originalWarn = console.warn;
      console.warn = (msg: string) => warnMessages.push(msg);

      try {
        const pipeline = createMockPipeline("disconnect-test-1", "test-pipeline");
        registry.register("disconnect-test-1", pipeline, mockPlatform);

        await handleDisconnect("disconnect-test-1");

        assert.ok(warnMessages.some((m) => m.includes("Client disconnected")));
        assert.ok(warnMessages.some((m) => m.includes("disconnect-test-1")));
      } finally {
        console.warn = originalWarn;
      }
    });

    test("should unregister pipeline after disconnect", async () => {
      const pipeline = createMockPipeline("disconnect-test-2", "test-pipeline");
      registry.register("disconnect-test-2", pipeline, mockPlatform);

      assert.strictEqual(registry.getAll().size, 1);

      await handleDisconnect("disconnect-test-2");

      assert.strictEqual(registry.getAll().size, 0);
    });

    test("should handle disconnect for non-existent pipeline gracefully", async () => {
      // Should not throw for non-existent pipeline
      await assert.doesNotReject(async () => {
        await handleDisconnect("non-existent-id");
      });
    });

    test("should log about retry hook when pipeline has retry event", async () => {
      const warnMessages: string[] = [];
      const originalWarn = console.warn;
      console.warn = (msg: string) => warnMessages.push(msg);

      try {
        const pipeline = createMockPipeline("disconnect-test-3", "test-pipeline", true);
        registry.register("disconnect-test-3", pipeline, mockPlatform);

        await handleDisconnect("disconnect-test-3");

        assert.ok(warnMessages.some((m) => m.includes("Calling retry hook")));
      } finally {
        console.warn = originalWarn;
      }
    });

    test("should not log about retry hook when pipeline has no retry event", async () => {
      const warnMessages: string[] = [];
      const originalWarn = console.warn;
      console.warn = (msg: string) => warnMessages.push(msg);

      try {
        const pipeline = createMockPipeline("disconnect-test-4", "test-pipeline", false);
        registry.register("disconnect-test-4", pipeline, mockPlatform);

        await handleDisconnect("disconnect-test-4");

        assert.ok(!warnMessages.some((m) => m.includes("Calling retry hook")));
      } finally {
        console.warn = originalWarn;
      }
    });

    test("normal completion should not be affected by disconnect handler", async () => {
      // This test verifies the pattern: once completed=true, disconnect won't trigger
      // We're testing the disconnect module directly here
      const pipeline = createMockPipeline("disconnect-test-5", "test-pipeline");
      registry.register("disconnect-test-5", pipeline, mockPlatform);

      // Simulate normal completion - unregister the pipeline
      registry.unregister("disconnect-test-5");

      // Now calling handleDisconnect should do nothing harmful
      await handleDisconnect("disconnect-test-5");

      // Pipeline was already removed, should still be empty
      assert.strictEqual(registry.getAll().size, 0);
    });

    for (const phase of ["step", "precheck"] as const) {
      test(`aborts in-flight ${phase} and emits only the retry hook`, async () => {
        const calls: string[] = [];
        let markWorkStarted!: () => void;
        const workStarted = new Promise<void>((resolve) => {
          markWorkStarted = resolve;
        });
        const platform: Platform = {
          ...mockPlatform,
          fetch: (async (url, init) => {
            const endpoint = String(url);
            calls.push(endpoint);
            if (endpoint.endsWith("/retry")) {
              return new Response("", { status: 200 });
            }
            if (endpoint.endsWith("/work")) {
              markWorkStarted();
              return await new Promise<Response>((_resolve, reject) => {
                const signal = init?.signal;
                if (signal?.aborted) {
                  reject(new Error("aborted"));
                  return;
                }
                signal?.addEventListener("abort", () => reject(new Error("aborted")));
              });
            }
            return new Response("", { status: 200 });
          }) as Platform["fetch"],
        };
        const pipeline = {
          id: "disconnect-abort",
          version: "v3",
          name: "disconnect-abort",
          status: 0,
          steps: [
            { method: "POST", endpoint: "http://example.com/work" },
            { method: "POST", endpoint: "http://example.com/should-not-run" },
          ],
          events: {
            precheck: phase === "precheck" ? { method: "POST", endpoint: "http://example.com/work" } : undefined,
            success: { method: "POST", endpoint: "http://example.com/success" },
            retry: { method: "POST", endpoint: "http://example.com/retry" },
            failure: { method: "POST", endpoint: "http://example.com/failure" },
          },
        } as Pipeline;

        const processing = processor(pipeline, platform);
        await workStarted;
        await handleDisconnect("disconnect-abort");
        const result = await processing;

        assert.strictEqual(result.status, 503);
        assert.deepStrictEqual(calls, ["http://example.com/work", "http://example.com/retry"]);
        assert.strictEqual(result.message, "Pipeline interrupted before completion");
        assert.strictEqual(registry.getAll().size, 0);
      });
    }

    test("does not emit a second retry hook when one is already running", async () => {
      const calls: string[] = [];
      let markRetryStarted!: () => void;
      const retryStarted = new Promise<void>((resolve) => {
        markRetryStarted = resolve;
      });
      const platform: Platform = {
        ...mockPlatform,
        fetch: (async (url, init) => {
          const endpoint = String(url);
          calls.push(endpoint);
          if (endpoint.endsWith("/work")) {
            return new Response("", { status: 503 });
          }
          if (endpoint.endsWith("/retry")) {
            markRetryStarted();
            return await new Promise<Response>((_resolve, reject) => {
              const signal = init?.signal;
              if (signal?.aborted) {
                reject(new Error("aborted"));
                return;
              }
              signal?.addEventListener("abort", () => reject(new Error("aborted")));
            });
          }
          return new Response("", { status: 200 });
        }) as Platform["fetch"],
      };
      const pipeline = {
        id: "disconnect-during-retry",
        version: "v3",
        name: "disconnect-during-retry",
        status: 0,
        steps: [{ method: "POST", endpoint: "http://example.com/work" }],
        events: {
          retry: { method: "POST", endpoint: "http://example.com/retry" },
        },
      } as Pipeline;

      const processing = processor(pipeline, platform);
      await retryStarted;
      await handleDisconnect("disconnect-during-retry");
      const result = await processing;

      assert.strictEqual(result.status, 503);
      assert.deepStrictEqual(calls, ["http://example.com/work", "http://example.com/retry"]);
      assert.strictEqual(registry.getAll().size, 0);
    });
  });
});
