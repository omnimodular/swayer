import { describe, test } from "node:test";
import assert from "node:assert";
import { Response } from "node-fetch";

import Event from "../src/events.js";
import Pipeline from "../src/pipeline.js";
import Platform from "../src/platform.js";
import { pipelineFailureLog } from "../src/observability.js";

function createPlatform(calls: Array<{ body: string | undefined }>, status = 200): Platform {
  return {
    fetch: (async (_url, init) => {
      calls.push({ body: init?.body?.toString() });
      return new Response("", { status });
    }) as Platform["fetch"],
    log: () => {},
    logs: () => {},
    warn: () => {},
    error: () => {},
    trace: () => {},
  };
}

describe("failure events", () => {
  test("adds pipeline error message as failureReason to object bodies", async () => {
    const calls: Array<{ body: string | undefined }> = [];
    const pipeline = {
      version: "v3",
      name: "delivery-workflow",
      status: 400,
      error: {
        message: "Unable to connect to endpoint https://example.test with status 403",
        step: "deliver-output",
      },
      steps: [],
      events: {
        failure: {
          method: "PATCH",
          endpoint: "http://api.example.test/jobs/job-id",
          body: { status: "failed" },
        },
      },
    } as Pipeline;

    await Event.failure(pipeline, createPlatform(calls));

    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(JSON.parse(calls[0].body ?? ""), {
      status: "failed",
      failureReason: "Unable to connect to endpoint https://example.test with status 403",
    });
  });

  test("does not overwrite explicit failureReason", async () => {
    const calls: Array<{ body: string | undefined }> = [];
    const pipeline = {
      version: "v3",
      name: "delivery-workflow",
      status: 400,
      error: {
        message: "runtime reason",
        step: "deliver-output",
      },
      steps: [],
      events: {
        failure: {
          method: "PATCH",
          endpoint: "http://api.example.test/jobs/job-id",
          body: { status: "failed", failureReason: "operator_terminal_failure" },
        },
      },
    } as Pipeline;

    await Event.failure(pipeline, createPlatform(calls));

    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(JSON.parse(calls[0].body ?? ""), {
      status: "failed",
      failureReason: "operator_terminal_failure",
    });
  });

  test("sanitizes endpoint secrets from generated failureReason", async () => {
    const calls: Array<{ body: string | undefined }> = [];
    const pipeline = {
      version: "v3",
      name: "delivery-workflow",
      status: 400,
      error: {
        message: "Unable to connect to endpoint https://user:secret@example.test/process?token=sensitive#fragment with status 403",
        step: "deliver-output",
      },
      steps: [],
      events: {
        failure: {
          method: "PATCH",
          endpoint: "http://api.example.test/jobs/job-id",
          body: { status: "failed" },
        },
      },
    } as Pipeline;

    await Event.failure(pipeline, createPlatform(calls));

    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(JSON.parse(calls[0].body ?? ""), {
      status: "failed",
      failureReason: "Unable to connect to endpoint https://example.test/process with status 403",
    });
  });

  test("preserves the pipeline root cause when its failure hook fails", async () => {
    const calls: Array<{ body: string | undefined }> = [];
    const originalError = {
      message: "Unable to connect to processor with status 403",
      step: "process-document",
    };
    const pipeline = {
      version: "v3",
      name: "processing-workflow",
      status: 403,
      error: originalError,
      steps: [],
      events: {
        failure: {
          method: "PATCH",
          endpoint: "http://api.example.test/jobs/job-id",
          body: { status: "failed" },
        },
      },
    } as Pipeline;

    await Event.failure(pipeline, createPlatform(calls, 500));

    assert.deepStrictEqual(pipeline.error, originalError);
    assert.strictEqual(pipeline.status, 503);
    assert.deepStrictEqual(pipeline.hookError, {
      event: "failure",
      message: "PATCH endpoint http://api.example.test/jobs/job-id returned HTTP 500",
    });
    assert.deepStrictEqual(pipelineFailureLog(pipeline), {
      event: "swayer.pipeline.failed",
      level: "warning",
      traceId: undefined,
      swayerJobId: undefined,
      pipelineName: "processing-workflow",
      status: 503,
      message: originalError.message,
      step: originalError.step,
      hookError: "PATCH endpoint http://api.example.test/jobs/job-id returned HTTP 500",
      hookEvent: "failure",
    });
  });
});

describe("event request bodies", () => {
  const send = async (body: object | string) => {
    const calls: Array<{ body: unknown; headers: unknown }> = [];
    const platform = {
      ...createPlatform([]),
      fetch: (async (_url, init) => {
        calls.push({ body: init?.body, headers: init?.headers });
        return new Response("", { status: 200 });
      }) as Platform["fetch"],
    };
    const pipeline = {
      version: "v3",
      name: "success-workflow",
      status: 200,
      steps: [],
      events: { success: { method: "POST", endpoint: "http://api/done", body } },
    } as unknown as Pipeline;
    await Event.success(pipeline, platform);
    return calls[0];
  };

  test("sends object bodies as JSON", async () => {
    const call = await send({ status: "done" });
    assert.strictEqual(call.body, JSON.stringify({ status: "done" }));
    assert.deepStrictEqual(call.headers, { "Content-Type": "application/json" });
  });

  test("sends string bodies as plain text", async () => {
    const call = await send("done");
    assert.strictEqual(call.body, "done");
    assert.deepStrictEqual(call.headers, { "Content-Type": "text/plain;charset=UTF-8" });
  });
});
