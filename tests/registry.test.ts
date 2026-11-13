import { describe, test, beforeEach } from "node:test";
import assert from "node:assert";

import registry from "../src/registry.js";
import Pipeline from "../src/pipeline.js";
import Platform from "../src/platform.js";

const mockPlatform: Platform = {
  fetch: {} as any,
  log: () => {},
  logs: () => {},
  trace: () => {},
  warn: () => {},
  error: () => {},
};

const createMockPipeline = (id: string, name: string, hasFailureEvent: boolean = false): Pipeline =>
  ({
    id,
    name,
    status: 0,
    steps: [],
    events: hasFailureEvent
      ? {
          failure: {
            method: "POST",
            endpoint: "http://example.com/failure",
          },
        }
      : undefined,
  }) as Pipeline;

describe("registry", () => {
  beforeEach(() => {
    // Clear all pipelines before each test
    const all = registry.getAll();
    for (const id of all.keys()) {
      registry.unregister(id);
    }
  });

  describe("register", () => {
    test("should register a pipeline", () => {
      const pipeline = createMockPipeline("test-id-1", "test-pipeline");
      registry.register("test-id-1", pipeline, mockPlatform);

      const all = registry.getAll();
      assert.strictEqual(all.size, 1);
      assert.ok(all.has("test-id-1"));
    });

    test("should register multiple pipelines", () => {
      const pipeline1 = createMockPipeline("test-id-1", "test-pipeline-1");
      const pipeline2 = createMockPipeline("test-id-2", "test-pipeline-2");

      registry.register("test-id-1", pipeline1, mockPlatform);
      registry.register("test-id-2", pipeline2, mockPlatform);

      const all = registry.getAll();
      assert.strictEqual(all.size, 2);
      assert.ok(all.has("test-id-1"));
      assert.ok(all.has("test-id-2"));
    });

    test("should overwrite existing pipeline with same id", () => {
      const pipeline1 = createMockPipeline("test-id-1", "test-pipeline-1");
      const pipeline2 = createMockPipeline("test-id-1", "test-pipeline-2");

      registry.register("test-id-1", pipeline1, mockPlatform);
      registry.register("test-id-1", pipeline2, mockPlatform);

      const all = registry.getAll();
      assert.strictEqual(all.size, 1);
      assert.strictEqual(all.get("test-id-1")?.request.name, "test-pipeline-2");
    });
  });

  describe("unregister", () => {
    test("should unregister an existing pipeline", () => {
      const pipeline = createMockPipeline("test-id-1", "test-pipeline");
      registry.register("test-id-1", pipeline, mockPlatform);

      registry.unregister("test-id-1");

      const all = registry.getAll();
      assert.strictEqual(all.size, 0);
    });

    test("should not throw when unregistering non-existent pipeline", () => {
      assert.doesNotThrow(() => {
        registry.unregister("non-existent-id");
      });
    });

    test("should only unregister the specified pipeline", () => {
      const pipeline1 = createMockPipeline("test-id-1", "test-pipeline-1");
      const pipeline2 = createMockPipeline("test-id-2", "test-pipeline-2");

      registry.register("test-id-1", pipeline1, mockPlatform);
      registry.register("test-id-2", pipeline2, mockPlatform);

      registry.unregister("test-id-1");

      const all = registry.getAll();
      assert.strictEqual(all.size, 1);
      assert.ok(all.has("test-id-2"));
      assert.ok(!all.has("test-id-1"));
    });
  });

  describe("abort", () => {
    test("signals an active pipeline without removing its registry entry", () => {
      const pipeline = createMockPipeline("test-id-abort", "test-pipeline");
      const active = registry.register("test-id-abort", pipeline, mockPlatform);

      assert.strictEqual(active.controller.signal.aborted, false);
      assert.strictEqual(registry.abort("test-id-abort"), active);
      assert.strictEqual(active.controller.signal.aborted, true);
      assert.strictEqual(registry.getAll().has("test-id-abort"), true);
    });
  });

  describe("terminal hook ownership", () => {
    test("allows only one terminal hook claim", () => {
      const pipeline = createMockPipeline("test-id-claim", "test-pipeline");
      registry.register("test-id-claim", pipeline, mockPlatform);

      assert.strictEqual(registry.claimTerminalHook("test-id-claim"), true);
      assert.strictEqual(registry.claimTerminalHook("test-id-claim"), false);
    });

    test("interrupts, removes, and claims an unclaimed pipeline", () => {
      const pipeline = createMockPipeline("test-id-interrupt", "test-pipeline");
      const active = registry.register("test-id-interrupt", pipeline, mockPlatform);

      const interrupted = registry.interrupt("test-id-interrupt");

      assert.strictEqual(interrupted?.pipeline, active);
      assert.strictEqual(interrupted?.shouldNotifyRetry, true);
      assert.strictEqual(active.controller.signal.aborted, true);
      assert.strictEqual(registry.getAll().has("test-id-interrupt"), false);
    });

    test("does not grant interruption a second terminal hook", () => {
      const pipeline = createMockPipeline("test-id-owned", "test-pipeline");
      registry.register("test-id-owned", pipeline, mockPlatform);
      registry.claimTerminalHook("test-id-owned");

      const interrupted = registry.interrupt("test-id-owned");

      assert.strictEqual(interrupted?.shouldNotifyRetry, false);
      assert.strictEqual(registry.getAll().has("test-id-owned"), false);
    });
  });

  describe("getAll", () => {
    test("should return empty map when no pipelines registered", () => {
      const all = registry.getAll();
      assert.strictEqual(all.size, 0);
    });

    test("should return all registered pipelines", () => {
      const pipeline1 = createMockPipeline("test-id-1", "test-pipeline-1", true);
      const pipeline2 = createMockPipeline("test-id-2", "test-pipeline-2", false);

      registry.register("test-id-1", pipeline1, mockPlatform);
      registry.register("test-id-2", pipeline2, mockPlatform);

      const all = registry.getAll();
      assert.strictEqual(all.size, 2);

      const entry1 = all.get("test-id-1");
      assert.ok(entry1);
      assert.strictEqual(entry1.request.name, "test-pipeline-1");
      assert.ok(entry1.request.events?.failure);

      const entry2 = all.get("test-id-2");
      assert.ok(entry2);
      assert.strictEqual(entry2.request.name, "test-pipeline-2");
      assert.ok(!entry2.request.events?.failure);
    });
  });
});
