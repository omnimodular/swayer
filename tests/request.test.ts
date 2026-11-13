import { describe, test, mock } from "node:test";
import assert from "node:assert";
import { Mock } from "node:test";
import fetch, { Response } from "node-fetch";

import { requestEndpointMethodWithContext } from "../src/request.js";
import ProcessorContext from "../src/context.js";
import Platform from "../src/platform.js";
import { PipelineHeaders } from "../src/pipeline.js";

const mockFetch = (status: number, data?: string): Mock<typeof fetch> => mock.fn(async () => new Response(data, { status }));

describe("requestEndpointMethodWithContext", () => {
  const createStep = (obj?: object) => ({ method: "GET", endpoint: "$test", ...obj }) as any;
  test("fetches endpoint", async () => {
    const context = {} as ProcessorContext;
    const mockedFetch = mockFetch(200, "$data");
    const platform = { fetch: mockedFetch } as unknown as Platform;
    await requestEndpointMethodWithContext(createStep(), undefined, context, platform);
    assert.strictEqual(context.output?.toString(), "$data");
    const call = mockedFetch.mock.calls[0];
    assert.strictEqual(call.arguments[0], "$test");
    assert.strictEqual(call.arguments[1]?.method, "GET");
  });
  test("makes exactly one attempt when the endpoint call fails", async () => {
    const context = {} as ProcessorContext;
    const mockedFetch = mock.fn(async () => {
      throw new Error("connection reset");
    }) as unknown as Mock<typeof fetch>;
    const platform = { fetch: mockedFetch } as unknown as Platform;

    await assert.rejects(requestEndpointMethodWithContext(createStep(), undefined, context, platform), /connection reset/);

    assert.strictEqual(mockedFetch.mock.callCount(), 1);
  });
  test("should on failure have no output", async () => {
    const context = {} as ProcessorContext;
    const mockedFetch = mockFetch(400, "$data");
    const platform = { fetch: mockedFetch } as unknown as Platform;
    await requestEndpointMethodWithContext(createStep(), undefined, context, platform);
    assert.ok(!context.output?.toString());
  });
  test("should add top headers", async () => {
    const context = {} as ProcessorContext;
    const mockedFetch = mockFetch(200);
    const platform = { fetch: mockedFetch } as unknown as Platform;
    const headers = { "Content-Type": "text/plain" };
    await requestEndpointMethodWithContext(createStep(), headers, context, platform);
    const init = mockedFetch.mock.calls[0].arguments[1];
    assert.deepStrictEqual(init?.headers, headers);
  });
  test("should add step headers", async () => {
    const context = {} as ProcessorContext;
    const mockedFetch = mockFetch(200);
    const platform = { fetch: mockedFetch } as unknown as Platform;
    const headers = { "Content-Type": "text/plain" };
    await requestEndpointMethodWithContext(createStep({ headers }), undefined, context, platform);
    const init = mockedFetch.mock.calls[0].arguments[1];
    assert.deepStrictEqual(init?.headers, headers);
  });
  test("should add combined headers", async () => {
    const context = {} as ProcessorContext;
    const mockedFetch = mockFetch(200);
    const platform = { fetch: mockedFetch } as unknown as Platform;
    const topHeaders = { "Content-Type": "text/plain" };
    const stepHeaders = { "Content-Encoding": "identity" };
    await requestEndpointMethodWithContext(createStep({ headers: stepHeaders }), topHeaders, context, platform);
    const init = mockedFetch.mock.calls[0].arguments[1];
    assert.deepStrictEqual(init?.headers, {
      "Content-Type": "text/plain",
      "Content-Encoding": "identity",
    });
  });
  test("should not send body when GET method", async () => {
    const body = "$body";
    const context = { input: body } as ProcessorContext;
    const mockedFetch = mockFetch(200);
    const platform = { fetch: mockedFetch } as unknown as Platform;
    await requestEndpointMethodWithContext(createStep({ body }), undefined, context, platform);
    const init = mockedFetch.mock.calls[0].arguments[1];
    assert.ok(!init?.body);
  });
  test("should not send Content-Length header when GET method", async () => {
    // Regression test: Content-Length from previous response in context.headers
    // should not be forwarded to GET requests (causes connection issues)
    const context = { headers: { "Content-Length": "1234", "Content-Type": "application/json" } } as unknown as ProcessorContext;
    const mockedFetch = mockFetch(200);
    const platform = { fetch: mockedFetch } as unknown as Platform;
    await requestEndpointMethodWithContext(createStep({ method: "GET" }), undefined, context, platform);
    const init = mockedFetch.mock.calls[0].arguments[1];
    const headers = init?.headers as PipelineHeaders;
    assert.strictEqual(headers["Content-Length"], undefined);
    // But other headers from context should still be present
    assert.strictEqual(headers["Content-Type"], "application/json");
  });
  test("should not send Content-Length header when HEAD method", async () => {
    const context = { headers: { "Content-Length": "1234" } } as unknown as ProcessorContext;
    const mockedFetch = mockFetch(200);
    const platform = { fetch: mockedFetch } as unknown as Platform;
    await requestEndpointMethodWithContext(createStep({ method: "HEAD" }), undefined, context, platform);
    const init = mockedFetch.mock.calls[0].arguments[1];
    const headers = init?.headers as PipelineHeaders;
    assert.strictEqual(headers["Content-Length"], undefined);
  });
  test("should not forward Content-Length header for POST method", async () => {
    // The previous response's Content-Length may describe compressed bytes,
    // while the forwarded body is decompressed; fetch computes it instead
    const context = { headers: { "Content-Length": "1234" }, input: "test" } as unknown as ProcessorContext;
    const mockedFetch = mockFetch(200);
    const platform = { fetch: mockedFetch } as unknown as Platform;
    await requestEndpointMethodWithContext(createStep({ method: "POST" }), undefined, context, platform);
    const init = mockedFetch.mock.calls[0].arguments[1];
    const headers = init?.headers as PipelineHeaders;
    assert.strictEqual(headers["Content-Length"], undefined);
  });
  test("should not forward Content-Length header for DELETE method without body", async () => {
    // fetch only recomputes Content-Length when there is a body, so a stale
    // value would reach the endpoint and make it wait for missing bytes
    const context = { headers: { "Content-Length": "1234" } } as unknown as ProcessorContext;
    const mockedFetch = mockFetch(200);
    const platform = { fetch: mockedFetch } as unknown as Platform;
    await requestEndpointMethodWithContext(createStep({ method: "DELETE" }), undefined, context, platform);
    const init = mockedFetch.mock.calls[0].arguments[1];
    const headers = init?.headers as PipelineHeaders;
    assert.strictEqual(headers["Content-Length"], undefined);
  });
  test("should send step JSON body as application/json despite previous Content-Type", async () => {
    const context = { headers: { "Content-Type": "text/plain" }, input: "$inputBody" } as unknown as ProcessorContext;
    const mockedFetch = mockFetch(200);
    const platform = { fetch: mockedFetch } as unknown as Platform;
    const body = { key: "value" };
    await requestEndpointMethodWithContext(createStep({ method: "POST", body }), undefined, context, platform);
    const init = mockedFetch.mock.calls[0].arguments[1];
    assert.strictEqual(init?.body, JSON.stringify(body));
    assert.deepStrictEqual(init?.headers, { "Content-Type": "application/json" });
  });
  test("should send step string body as plain text despite previous Content-Type", async () => {
    const context = { headers: { "Content-Type": "application/json" } } as unknown as ProcessorContext;
    const mockedFetch = mockFetch(200);
    const platform = { fetch: mockedFetch } as unknown as Platform;
    await requestEndpointMethodWithContext(createStep({ method: "POST", body: "$body" }), undefined, context, platform);
    const init = mockedFetch.mock.calls[0].arguments[1];
    assert.strictEqual(init?.body, "$body");
    assert.deepStrictEqual(init?.headers, { "Content-Type": "text/plain;charset=UTF-8" });
  });
  test("should prefer step Content-Type for step JSON body", async () => {
    const context = { headers: { "Content-Type": "text/plain" } } as unknown as ProcessorContext;
    const mockedFetch = mockFetch(200);
    const platform = { fetch: mockedFetch } as unknown as Platform;
    const headers = { "Content-Type": "application/merge-patch+json" };
    await requestEndpointMethodWithContext(createStep({ method: "PATCH", body: {}, headers }), undefined, context, platform);
    const init = mockedFetch.mock.calls[0].arguments[1];
    assert.deepStrictEqual(init?.headers, headers);
  });
  test("should send step string body as plain text", async () => {
    const context = {} as ProcessorContext;
    const mockedFetch = mockFetch(200);
    const platform = { fetch: mockedFetch } as unknown as Platform;
    const body = "$body";
    await requestEndpointMethodWithContext(createStep({ method: "POST", body }), undefined, context, platform);
    const init = mockedFetch.mock.calls[0].arguments[1];
    assert.strictEqual(init?.body, body);
    assert.deepStrictEqual(init?.headers, { "Content-Type": "text/plain;charset=UTF-8" });
  });
  test("should send input body", async () => {
    const body = "$body";
    const context = { input: body } as ProcessorContext;
    const mockedFetch = mockFetch(200);
    const platform = { fetch: mockedFetch } as unknown as Platform;
    await requestEndpointMethodWithContext(createStep({ method: "POST" }), undefined, context, platform);
    const init = mockedFetch.mock.calls[0].arguments[1];
    assert.strictEqual(init?.body, body);
  });
  test("should send step body before input body", async () => {
    const context = { input: "$inputBody" } as ProcessorContext;
    const mockedFetch = mockFetch(200);
    const platform = { fetch: mockedFetch } as unknown as Platform;
    const body = "$stepBody";
    await requestEndpointMethodWithContext(createStep({ method: "POST", body }), undefined, context, platform);
    const init = mockedFetch.mock.calls[0].arguments[1];
    assert.strictEqual(init?.body, body);
  });
  test("should send step body with specific Content-Type", async () => {
    const context = {} as ProcessorContext;
    const mockedFetch = mockFetch(200);
    const platform = { fetch: mockedFetch } as unknown as Platform;
    const headers = { "Content-Type": "text/plain" };
    const body = "$body";
    await requestEndpointMethodWithContext(createStep({ method: "POST", body }), headers, context, platform);
    const init = mockedFetch.mock.calls[0].arguments[1];
    assert.deepStrictEqual(init?.headers, { "Content-Type": "text/plain" });
  });
  test("should send input body with specific Content-Type", async () => {
    const body = "$body";
    const context = { input: body, headers: { "Content-Type": "text/plain" } as PipelineHeaders } as ProcessorContext;
    const mockedFetch = mockFetch(200);
    const platform = { fetch: mockedFetch } as unknown as Platform;
    await requestEndpointMethodWithContext(createStep({ method: "POST" }), undefined, context, platform);
    const init = mockedFetch.mock.calls[0].arguments[1];
    assert.strictEqual(init?.body, body);
    assert.deepStrictEqual(init?.headers, { "Content-Type": "text/plain" });
  });
});
