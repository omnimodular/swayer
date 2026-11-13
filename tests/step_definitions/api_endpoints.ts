import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert";
import { Response, Headers } from "node-fetch";

import MockWorld from "../support/world.js";

export function mockEndpoints(this: MockWorld) {
  if (this.endpoints) return;
  this.endpoints = {};
  this.platform.fetch.mock.mockImplementation(async (input, _init) => {
    const end = input.toString();
    if (end in this.endpoints) {
      const data = this.endpoints[end];
      if (data.status || data.data || data.headers || data.cookies) {
        const headers = new Headers(data.headers);
        for (const cookie of data.cookies || []) {
          headers.append("Set-Cookie", cookie);
        }
        return new Response(data.data, { status: data.status, headers });
      } else if (data.error) {
        throw data.error;
      }
    }
    return new Response();
  });
}

Given("endpoint {string} responds with {string}", function (this: MockWorld, endpoint: string, data: string) {
  mockEndpoints.call(this);
  this.endpoints[endpoint] = { ...this.endpoints[endpoint], data };
});

Given("endpoint {string} responds with status {int}", function (this: MockWorld, endpoint: string, status: number) {
  mockEndpoints.call(this);
  this.endpoints[endpoint] = { ...this.endpoints[endpoint], status };
});

Given("endpoint {string} responds with error", async function (this: MockWorld, endpoint: string) {
  mockEndpoints.call(this);
  this.endpoints[endpoint] = { ...this.endpoints[endpoint], error: new Error("TEST ERROR MESSAGE") };
});

Given(
  "endpoint {string} responds with header {string} value {string}",
  function (this: MockWorld, endpoint: string, key: string, value: string) {
    mockEndpoints.call(this);
    if (!this.endpoints[endpoint]) this.endpoints[endpoint] = {};
    if (!this.endpoints[endpoint].headers) this.endpoints[endpoint].headers = {};
    this.endpoints[endpoint].headers[key] = value;
  },
);

Given("endpoint {string} responds with header cookie value {string}", function (this: MockWorld, endpoint: string, value: string) {
  mockEndpoints.call(this);
  if (!this.endpoints[endpoint]) this.endpoints[endpoint] = {};
  if (!this.endpoints[endpoint].cookies) this.endpoints[endpoint].cookies = [];
  this.endpoints[endpoint].cookies.push(value);
});

function findFetchEndpoint(this: MockWorld, endpoint: string) {
  return this.platform.fetch.mock.calls.find(({ arguments: args }: { arguments: any[] }) => args[0] === endpoint);
}

Then("endpoint {string} has been called", function (this: MockWorld, endpoint: string) {
  assert.ok(findFetchEndpoint.call(this, endpoint), `Endpoint ${endpoint} has not been called`);
});

Then("endpoint {string} has been called with method {string}", function (this: MockWorld, endpoint: string, method: string) {
  assert.strictEqual(findFetchEndpoint.call(this, endpoint)?.arguments[1]?.method, method);
});

Then("endpoint {string} has been called with body {string}", function (this: MockWorld, endpoint: string, data: string) {
  const body = findFetchEndpoint.call(this, endpoint)?.arguments[1]?.body;
  assert.strictEqual(Buffer.from(body as ArrayBuffer).toString(), data);
});

Then(
  "endpoint {string} has been called with header {string} value {string}",
  function (this: MockWorld, endpoint: string, key: string, value: string) {
    const headers = findFetchEndpoint.call(this, endpoint)?.arguments[1]?.headers as Record<string, string>;
    assert.ok(headers, `Missing headers on endpoint ${endpoint}`);
    assert.strictEqual(headers[key], value);
  },
);

Then("endpoint {string} has missing header {string}", function (this: MockWorld, endpoint: string, key: string) {
  const headers = findFetchEndpoint.call(this, endpoint)?.arguments[1]?.headers as Record<string, string>;
  if (headers) {
    assert.ok(!(key in headers), `Missing '${key}' in headers`);
  }
});
