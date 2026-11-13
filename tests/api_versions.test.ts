import { test } from "node:test";
import assert from "node:assert/strict";
import { Response } from "node-fetch";

import API from "../src/api.js";
import Communication from "../src/communication.js";
import Platform from "../src/platform.js";

async function post(body: object, endpointStatus = 200) {
  const calls: string[] = [];
  const warnings: unknown[][] = [];
  const response = {
    statusCode: 0,
    body: undefined as any,
    headers: {} as Record<string, string>,
    set(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(value: any) {
      this.body = value;
      return this;
    },
    end() {
      return this;
    },
  };
  const platform: Platform = {
    fetch: async (url) => {
      calls.push(String(url));
      return new Response("", { status: endpointStatus });
    },
    log: () => {},
    logs: () => {},
    trace: () => {},
    warn: (...args) => {
      warnings.push(args);
    },
    error: () => {},
  };
  await API.post({ headers: {}, body }, response as Communication.Response, platform);
  return { response, calls, warnings };
}

const events = Object.fromEntries(
  ["precheck", "success", "retry", "failure"].map((event) => [
    event,
    {
      method: "POST",
      endpoint: `https://example.test/${event}`,
    },
  ]),
);

for (const version of ["v1", "v2", "v4", "", null, 3, false, {}, []]) {
  test(`rejects version ${JSON.stringify(version)} before any step or hook`, async () => {
    const body = {
      name: "unsupported-version",
      version,
      events,
      steps: [{ method: "GET", endpoint: "https://example.test/step" }],
    };
    const { response, calls } = await post(body);
    assert.equal(response.statusCode, 422);
    assert.equal(response.headers["x-swayer-outcome"], "permanent-failure");
    assert.equal(response.body.message, "Does not follow JSON schema");
    assert.ok(response.body.schema.length > 0);
    assert.deepEqual(calls, []);
    assert.deepEqual(body.version, version);
  });
}

for (const fields of [
  { pipeline: [] },
  { pipeline: [], version: "v1" },
  { pipeline: [], version: "v3" },
  { pipeline: [], steps: [] },
  { pipeline: [], steps: [], version: "v3" },
  { version: "v3" },
]) {
  test(`rejects legacy or missing steps: ${JSON.stringify(fields)}`, async () => {
    const { response, calls } = await post({ name: "invalid-shape", events, ...fields });
    assert.equal(response.statusCode, 422);
    assert.equal(response.headers["x-swayer-outcome"], "permanent-failure");
    assert.deepEqual(calls, []);
  });
}

for (const versionFields of [{}, { version: "v3" }]) {
  const label = "version" in versionFields ? "explicit" : "implicit";
  test(`${label} v3 is returned for an empty pipeline`, async () => {
    const { response, calls, warnings } = await post({ name: "empty", steps: [], ...versionFields });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.version, "v3");
    assert.deepEqual(calls, []);
    assert.deepEqual(warnings, []);
  });
  test(`${label} v3 is returned when precheck skips execution`, async () => {
    const { response, calls } = await post(
      {
        name: "skip",
        ...versionFields,
        events,
        steps: [{ method: "GET", endpoint: "https://example.test/step" }],
      },
      404,
    );
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.version, "v3");
    assert.deepEqual(calls, ["https://example.test/precheck"]);
  });
  test(`${label} v3 is returned for a failed pipeline`, async () => {
    const { response } = await post(
      {
        name: "failed",
        ...versionFields,
        steps: [{ method: "GET", endpoint: "https://example.test/step" }],
      },
      400,
    );
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.version, "v3");
    assert.equal(response.headers["x-swayer-outcome"], "permanent-failure");
  });
}
