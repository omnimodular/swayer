import { describe, test } from "node:test";
import assert from "node:assert";
import fetch, { Response as FetchResponse } from "node-fetch";

import API from "../src/api.js";
import Communication from "../src/communication.js";
import Platform from "../src/platform.js";
import { pipeline_count } from "../src/metrics.js";

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function createResponse() {
  const response = {
    statusCode: undefined as number | undefined,
    body: undefined as any,
    headers: {} as Record<string, string>,
    set(field: string, value: string) {
      response.headers[field.toLowerCase()] = value;
      return response;
    },
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    send(body: any) {
      response.body = body;
      return response;
    },
    end(body: any) {
      response.body = body;
      return response;
    },
  };
  return response as Communication.Response & typeof response;
}

function createPlatform(status: number, logs: any[]): Platform {
  return {
    fetch: (async () => new FetchResponse("ok", { status })) as typeof fetch,
    log: () => undefined,
    logs: (...objects: any[]) => logs.push(...objects),
    trace: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
}

function egressSteps() {
  return [
    {
      name: "deliver-output",
      method: "POST",
      endpoint: "https://customer.example/webhook?token=secret",
      body: { ok: true },
    },
  ];
}

function multiStepEgressSteps() {
  return [
    {
      name: "start-delivery",
      method: "PATCH",
      endpoint: "http://api.example.test/jobs/job-1",
      body: { status: "delivering" },
    },
    {
      name: "fetch-cloudevents-output",
      method: "GET",
      endpoint: "http://api.example.test/jobs/job-1/events",
    },
    ...egressSteps(),
  ];
}

async function postPipeline(status: number, logs: any[], steps: any[] = egressSteps()) {
  const res = createResponse();
  await API.post(
    {
      headers: {},
      body: {
        id: "swayer-job-1",
        traceId: "mx-message-1",
        version: "v3",
        name: "delivery-workflow",
        headers: {
          "x-om-trace-id": "header-trace",
        },
        steps,
      },
    },
    res,
    createPlatform(status, logs),
  );
  return res;
}

async function postRequest(body: object, platform: Platform) {
  const res = createResponse();
  await API.post({ headers: {}, body }, res, platform);
  return res;
}

async function metricValue(name: string, status: string): Promise<number> {
  const metric = await pipeline_count.get();
  return metric.values.find((value) => value.labels.name === name && value.labels.status === status)?.value ?? 0;
}

describe("API observability", () => {
  test("does not log successful pipelines by default", async () => {
    const previous = process.env.SWAYER_LOG_SUCCESS;
    delete process.env.SWAYER_LOG_SUCCESS;
    try {
      const logs: any[] = [];
      const res = await postPipeline(200, logs);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers["x-swayer-outcome"], "success");
      assert.deepStrictEqual(logs, []);
    } finally {
      restoreEnv("SWAYER_LOG_SUCCESS", previous);
    }
  });

  test("logs successful pipelines when enabled", async () => {
    const previous = process.env.SWAYER_LOG_SUCCESS;
    process.env.SWAYER_LOG_SUCCESS = "true";
    try {
      const logs: any[] = [];
      const res = await postPipeline(200, logs);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(logs.length, 1);
      assert.strictEqual(logs[0].event, "swayer.pipeline.completed");
      assert.strictEqual(logs[0].traceId, "mx-message-1");
      assert.strictEqual(logs[0].pipelineName, "delivery-workflow");
      assert.strictEqual(logs[0].httpStepCount, 1);
      assert.strictEqual(logs[0].lastStepName, "deliver-output");
      assert.strictEqual(logs[0].lastEndpoint, "https://customer.example/webhook");
      assert.strictEqual(logs[0].lastStatusCode, 200);
    } finally {
      restoreEnv("SWAYER_LOG_SUCCESS", previous);
    }
  });

  test("logs one successful pipeline summary for multi-step pipelines", async () => {
    const previous = process.env.SWAYER_LOG_SUCCESS;
    process.env.SWAYER_LOG_SUCCESS = "true";
    try {
      const logs: any[] = [];
      const res = await postPipeline(200, logs, multiStepEgressSteps());

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(logs.length, 1);
      assert.strictEqual(logs[0].event, "swayer.pipeline.completed");
      assert.strictEqual(logs[0].traceId, "mx-message-1");
      assert.strictEqual(logs[0].httpStepCount, 3);
      assert.strictEqual(logs[0].lastStepName, "deliver-output");
      assert.strictEqual(logs[0].lastEndpoint, "https://customer.example/webhook");
      assert.strictEqual(logs[0].lastStatusCode, 200);
    } finally {
      restoreEnv("SWAYER_LOG_SUCCESS", previous);
    }
  });

  test("always logs failed pipelines with trace id", async () => {
    const previous = process.env.SWAYER_LOG_SUCCESS;
    delete process.env.SWAYER_LOG_SUCCESS;
    try {
      const logs: any[] = [];
      const res = await postPipeline(500, logs);

      assert.strictEqual(res.statusCode, 500);
      assert.strictEqual(res.headers["x-swayer-outcome"], "retryable");
      assert.strictEqual(logs.length, 1);
      assert.strictEqual(logs[0].event, "swayer.pipeline.failed");
      assert.strictEqual(logs[0].traceId, "mx-message-1");
      assert.strictEqual(logs[0].pipelineName, "delivery-workflow");
      assert.strictEqual(logs[0].step, "deliver-output");
    } finally {
      restoreEnv("SWAYER_LOG_SUCCESS", previous);
    }
  });

  test("marks permanent business failures only after failure handling", async () => {
    const logs: any[] = [];
    const res = await postPipeline(400, logs);

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.headers["x-swayer-outcome"], "permanent-failure");
  });

  test("sets retryable outcome when processor throws", async () => {
    const logs: any[] = [];
    const res = await postRequest(
      {
        id: "processor-exception",
        version: "v3",
        name: "processor-exception",
        steps: [
          {
            method: null,
            patch: [{ op: "replace", path: "/missing", value: true }],
          },
        ],
      },
      createPlatform(200, logs),
    );

    assert.strictEqual(res.statusCode, 503);
    assert.strictEqual(res.headers["x-swayer-outcome"], "retryable");
  });

  test("sets permanent outcome when processor throws a permanent error", async () => {
    const logs: any[] = [];
    const res = await postRequest(
      {
        id: "permanent-processor-exception",
        version: "v3",
        name: "permanent-processor-exception",
        steps: [
          {
            method: null,
            body: { unsupported: 1n },
          },
        ],
      },
      createPlatform(200, logs),
    );

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.headers["x-swayer-outcome"], "permanent-failure");
    assert.strictEqual(logs[0].status, 400);
    assert.strictEqual(logs[0].outcome, "permanent-failure");
  });

  test("classifies malformed endpoint exceptions as permanent", async () => {
    const logs: any[] = [];
    const platform = createPlatform(200, logs);
    platform.fetch = (async () => {
      throw new TypeError("Invalid URL");
    }) as typeof fetch;

    const res = await postRequest(
      {
        id: "invalid-endpoint",
        version: "v3",
        name: "invalid-endpoint",
        steps: egressSteps(),
      },
      platform,
    );

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.headers["x-swayer-outcome"], "permanent-failure");
  });

  test("classifies malformed precheck endpoint exceptions as permanent", async () => {
    const logs: any[] = [];
    const platform = createPlatform(200, logs);
    platform.fetch = (async () => {
      throw new TypeError("Invalid URL");
    }) as typeof fetch;

    const res = await postRequest(
      {
        id: "invalid-precheck-endpoint",
        version: "v3",
        name: "invalid-precheck-endpoint",
        steps: [],
        events: {
          precheck: {
            endpoint: "not a URL",
          },
        },
      },
      platform,
    );

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.headers["x-swayer-outcome"], "permanent-failure");
  });

  test("counts a failed success hook as an error, not a success", async () => {
    const name = "success-hook-metric-regression";
    const beforeOk = await metricValue(name, "ok");
    const beforeError = await metricValue(name, "error");
    const logs: any[] = [];
    const platform = createPlatform(200, logs);
    platform.fetch = (async (url) =>
      new FetchResponse("", { status: String(url).includes("success-hook") ? 500 : 200 })) as typeof fetch;

    const res = await postRequest(
      {
        id: name,
        version: "v3",
        name,
        steps: egressSteps(),
        events: {
          success: {
            method: "POST",
            endpoint: "https://api.example/success-hook",
          },
        },
      },
      platform,
    );

    assert.strictEqual(res.statusCode, 503);
    assert.strictEqual((await metricValue(name, "ok")) - beforeOk, 0);
    assert.strictEqual((await metricValue(name, "error")) - beforeError, 1);
  });
});
