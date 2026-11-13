import { test } from "node:test";
import assert from "node:assert/strict";
import { Response, FetchError } from "node-fetch";
import processor from "../src/processor.js";
import Event from "../src/events.js";
import API from "../src/api.js";
import type Communication from "../src/communication.js";
import { pipelineFailureLog } from "../src/observability.js";
import { requestFailure } from "../src/request-errors.js";
import type Pipeline from "../src/pipeline.js";
import type Platform from "../src/platform.js";
import { PermanentDeliveryError } from "../src/delivery.js";

const endpoint = "https://user:secret@example.test/process?token=hidden#private";
function job(): Pipeline {
  return {
    id: "error-test",
    version: "v3",
    name: "test",
    status: 0,
    steps: [{ name: "process", method: "POST", endpoint }],
    events: {
      retry: { method: "PATCH", endpoint: "http://api/retry", body: { status: "retrying" } },
      failure: { method: "PATCH", endpoint: "http://api/fail", body: { status: "failed" } },
    },
  } as Pipeline;
}
function harness(outcome: number | Error) {
  const calls: { url: string; body?: string }[] = [];
  const warnings: unknown[] = [];
  const platform: Platform = {
    fetch: (async (url, init) => {
      calls.push({ url: String(url), body: init?.body?.toString() });
      if (String(url).startsWith("http://api/")) return new Response("");
      if (outcome instanceof Error) throw outcome;
      return new Response("secret upstream payload", { status: outcome });
    }) as Platform["fetch"],
    log: (...v) => warnings.push(v),
    logs: () => {},
    warn: (...v) => warnings.push(v),
    trace: (...v) => warnings.push(v),
    error: () => {},
  };
  return { calls, warnings, platform };
}
async function run(outcome: number | Error) {
  const mock = harness(outcome);
  return { ...mock, result: await processor(job(), mock.platform) };
}

for (const status of [403, 422, 408, 429, 500, 502, 503, 504]) {
  test(`HTTP ${status} is reported as a response and retains its hook policy`, async () => {
    const { result, calls } = await run(status);
    const message = `POST endpoint https://example.test/process returned HTTP ${status}`;
    assert.equal((result.error as { message: string }).message, message);
    assert.equal(result.status, status);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url, [403, 422].includes(status) ? "http://api/fail" : "http://api/retry");
    assert.equal(JSON.parse(calls[1].body!).failureReason, message);
    assert.equal(pipelineFailureLog(result).message, message);
    assert.doesNotMatch(message, /secret|hidden|private|Unable to connect/);
  });
}
for (const [code, category] of Object.entries({
  ENOTFOUND: "DNS lookup failed",
  EAI_AGAIN: "DNS lookup failed",
  ECONNREFUSED: "connection refused",
  ECONNRESET: "connection interrupted",
  EPIPE: "connection interrupted",
  ETIMEDOUT: "network timeout",
  CERT_HAS_EXPIRED: "TLS error",
  SELF_SIGNED_CERT_IN_CHAIN: "TLS error",
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: "TLS error",
  UNABLE_TO_GET_ISSUER_CERT: "TLS error",
  HOSTNAME_MISMATCH: "TLS error",
})) {
  test(`${code} has a safe, specific transport message`, async () => {
    const error = new FetchError(`request to ${endpoint} failed: secret`, "system", { code });
    const { result, calls, warnings } = await run(error);
    const message = `POST endpoint https://example.test/process failed: ${category} (${code})`;
    assert.equal((result.error as { message: string }).message, message);
    assert.equal(result.status, 503);
    assert.equal(calls[1].url, "http://api/retry");
    assert.doesNotMatch(JSON.stringify(warnings), /secret|hidden|private/);
  });
}
test("invalid and unknown errors do not leak raw messages or change retry classification", async () => {
  assert.equal((await run(new TypeError("secret"))).result.status, 400);
  const unknown = await run(new Error("secret"));
  assert.equal(unknown.result.status, 503);
  assert.equal(
    (unknown.result.error as { message: string }).message,
    "POST endpoint https://example.test/process failed: request execution error",
  );
  assert.doesNotMatch(JSON.stringify(unknown.warnings), /secret|hidden|private/);
  assert.match(requestFailure({ method: "GET", endpoint: "invalid secret" }, new Error("secret")), /<invalid endpoint>/);
});

test("other TLS certificate and handshake codes receive a safe TLS category", async () => {
  for (const code of ["CERT_NOT_YET_VALID", "ERR_SSL_WRONG_VERSION_NUMBER", "ERR_TLS_SECRET_UNKNOWN_CODE"]) {
    const { result, warnings } = await run(new FetchError("secret", "system", { code }));
    assert.equal((result.error as { message: string }).message, "POST endpoint https://example.test/process failed: TLS error");
    assert.equal(result.status, 503);
    assert.doesNotMatch(JSON.stringify(warnings), /secret|SECRET|hidden|private/);
  }
});

test("precheck safely wraps read-only exceptions and preserves retry classification", async () => {
  for (const error of [new Error("secret"), new TypeError("secret"), new PermanentDeliveryError("secret")]) {
    Object.freeze(error);
    const pipeline = job();
    pipeline.events = { precheck: { method: "GET", endpoint } };
    const { platform, warnings } = harness(error);
    await assert.rejects(Event.precheck(pipeline, platform), (wrapped: Error) => {
      assert.doesNotMatch(wrapped.stack ?? "", /secret|hidden|private/);
      assert.equal(wrapped instanceof TypeError, error instanceof TypeError);
      assert.equal(wrapped instanceof PermanentDeliveryError, error instanceof PermanentDeliveryError);
      return true;
    });
    const result = await processor(pipeline, platform);
    assert.equal(result.status, error instanceof TypeError || error instanceof PermanentDeliveryError ? 400 : 503);
    assert.equal(error.message, "secret");
    assert.doesNotMatch(JSON.stringify(warnings), /secret|hidden|private/);
  }
});

for (const stage of ["step", "precheck", "success", "failure", "retry", "cancel-race"] as const) {
  test(`the endpoint deadline is identified correctly during ${stage}`, async () => {
    const previous = process.env.SWAYER_ENDPOINT_TIMEOUT_MS;
    process.env.SWAYER_ENDPOINT_TIMEOUT_MS = "5";
    try {
      const pipeline = job();
      const execution = new AbortController();
      if (stage !== "step") pipeline.events = { [stage === "cancel-race" ? "retry" : stage]: { method: "POST", endpoint } };
      const calls: string[] = [];
      const platform = {
        fetch: async (url: unknown, init: any) => {
          calls.push(String(url));
          if (String(url).startsWith("http://api/")) return new Response("");
          return new Promise((_, reject) =>
            init.signal.addEventListener(
              "abort",
              () => {
                if (stage === "cancel-race") execution.abort();
                reject(Object.assign(new Error("secret"), { name: "AbortError" }));
              },
              {
                once: true,
              },
            ),
          );
        },
        log: () => {},
        logs: () => {},
        warn: () => {},
        error: () => {},
        trace: () => {},
      } as unknown as Platform;
      const message = "POST endpoint https://example.test/process timed out after 5 ms";
      if (stage === "step") {
        const result = await processor(pipeline, platform);
        assert.equal((result.error as { message: string }).message, message);
        assert.equal(result.status, 503);
        assert.deepEqual(calls, [endpoint, "http://api/retry"]);
      } else if (stage === "precheck") {
        await assert.rejects(Event.precheck(pipeline, platform), { message });
        assert.deepEqual(calls, [endpoint]);
      } else {
        const hook = stage === "cancel-race" ? "retry" : stage;
        await Event[hook](pipeline, platform, execution.signal);
        assert.equal(
          pipeline.hookError?.message,
          stage === "cancel-race" ? "POST endpoint https://example.test/process was aborted" : message,
        );
        assert.equal(pipeline.status, 503);
        assert.deepEqual(calls, [endpoint]);
      }
    } finally {
      if (previous === undefined) delete process.env.SWAYER_ENDPOINT_TIMEOUT_MS;
      else process.env.SWAYER_ENDPOINT_TIMEOUT_MS = previous;
    }
  });
}

test("external aborts and unknown codes are not reported as Swayer deadlines", () => {
  assert.equal(
    requestFailure({ method: "GET", endpoint }, { name: "AbortError" }),
    "GET endpoint https://example.test/process was aborted",
  );
  for (const code of ["constructor", "__proto__", "SECRET_UNKNOWN_CODE"]) {
    assert.equal(
      requestFailure({ method: "GET", endpoint }, { type: "system", code }),
      "GET endpoint https://example.test/process failed: transport error",
    );
  }
});

for (const hook of ["success", "failure", "retry"] as const) {
  for (const outcome of [422, new FetchError(`secret ${endpoint}`, "system", { code: "ECONNRESET" })]) {
    test(`${hook} hook failure is safe and preserves the original pipeline error (${typeof outcome})`, async () => {
      const pipeline = job();
      const original = { message: "Original rejection", step: "process" };
      pipeline.error = original;
      pipeline.events = { [hook]: { method: "PATCH", endpoint, body: {} } };
      const { platform, warnings } = harness(outcome);
      await Event[hook](pipeline, platform);
      assert.equal(pipeline.error, original);
      assert.equal(pipeline.status, 503);
      const message =
        typeof outcome === "number"
          ? "PATCH endpoint https://example.test/process returned HTTP 422"
          : "PATCH endpoint https://example.test/process failed: connection interrupted (ECONNRESET)";
      assert.deepEqual(pipeline.hookError, { event: hook, message });
      assert.doesNotMatch(JSON.stringify(warnings), /secret|hidden|private/);
    });
  }
}

test("precheck reports HTTP responses and transport failures safely", async () => {
  for (const outcome of [429, new FetchError(`secret ${endpoint}`, "system", { code: "ENOTFOUND" }), new TypeError("secret")]) {
    const pipeline = job();
    pipeline.events = { precheck: { method: "GET", endpoint } };
    const { platform, warnings } = harness(outcome);
    const result = await processor(pipeline, platform);
    const message =
      outcome === 429
        ? "GET endpoint https://example.test/process returned HTTP 429"
        : outcome instanceof TypeError
          ? "GET endpoint https://example.test/process failed: invalid request configuration"
          : "GET endpoint https://example.test/process failed: DNS lookup failed (ENOTFOUND)";
    assert.equal(result.message, message);
    assert.equal(result.status, outcome instanceof TypeError ? 400 : 503);
    assert.doesNotMatch(JSON.stringify(warnings), /secret|hidden|private/);
  }
});

test("invalid endpoints remain sanitized in generated failureReason", async () => {
  const pipeline = job();
  pipeline.steps[0] = { method: "POST", endpoint: "invalid secret" };
  const { platform, calls } = harness(200);
  const fetch = platform.fetch;
  platform.fetch = (async (url, init) => {
    if (url === "invalid secret") throw new TypeError("Invalid URL: secret");
    return fetch(url, init);
  }) as Platform["fetch"];
  const result = await processor(pipeline, platform);
  const message = "POST endpoint <invalid endpoint> failed: invalid request configuration";
  assert.equal((result.error as { message: string }).message, message);
  assert.equal(JSON.parse(calls.at(-1)!.body!).failureReason, message);
});

for (const status of [422, 429]) {
  test(`API preserves HTTP ${status} and its delivery outcome header`, async () => {
    const { platform, calls } = harness(status);
    const response = {
      code: 0,
      headers: {} as Record<string, string>,
      set(key: string, value: string) {
        this.headers[key] = value;
        return this;
      },
      status(code: number) {
        this.code = code;
        return this;
      },
      send() {
        return this;
      },
      end() {
        return this;
      },
    };
    const { id, version, name, steps, events } = job();
    await API.post(
      { body: { id, version, name, steps, events }, headers: {} },
      response as unknown as Communication.Response,
      platform,
    );
    assert.equal(response.code, status);
    assert.equal(response.headers["X-Swayer-Outcome"], status === 422 ? "permanent-failure" : "retryable");
    assert.equal(calls.length, 2);
    assert.equal(JSON.parse(calls[1].body!).failureReason, `POST endpoint https://example.test/process returned HTTP ${status}`);
  });
}
