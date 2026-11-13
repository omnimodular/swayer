import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert";

import API from "../../src/api.js";
import MockWorld from "../support/world.js";
import { EndpointMethod, MethodType } from "../../src/pipeline.js";

Given("request body {string} is {string}", function (this: MockWorld, key: string, val: string) {
  const request = this.requestBody<typeof key, typeof val>();
  request[key] = val;
});

Given("request body {string} has an empty array", function (this: MockWorld, key: string) {
  const request = this.requestBody<typeof key, any>();
  request[key] = [];
});

Given("request body {string} include {string}", function (this: MockWorld, key: string, value: string) {
  const request = this.requestBody<typeof key, any>();
  request[key].push(value);
});

Given("request body {string} is missing", function (this: MockWorld, key: string) {
  const request = this.requestBody<typeof key, any>();
  delete request[key];
});

Given("request body {string} is {boolean}", function (this: MockWorld, key: string, value: boolean) {
  const request = this.requestBody<typeof key, any>();
  request[key] = value;
});

Given("request body headers has {string} value {string}", function (this: MockWorld, key: string, data: string) {
  const request = this.requestPipeline();
  if (!request.headers) request.headers = {};
  request.headers[key] = data;
});

Given("request body headers has passthrough {string}", function (this: MockWorld, key: string) {
  const request = this.requestPipeline();
  if (!request.passthrough) request.passthrough = [];
  request.passthrough.push(key);
});

Given("request body pipeline include step body {string}", function (this: MockWorld, body: string) {
  const request = this.requestPipeline();
  if (!request.steps) request.steps = [];
  request.steps.push({ body });
});

Given("request body pipeline include step body JSON {json}", function (this: MockWorld, body: object) {
  const request = this.requestPipeline();
  if (!request.steps) request.steps = [];
  request.steps.push({ body });
});

Given("request body pipeline include step patch JSON {json}", function (this: MockWorld, patch: object[]) {
  const request = this.requestPipeline();
  if (!request.steps) request.steps = [];
  request.steps.push({ patch });
});

Given("request body pipeline include step {string} to {string}", function (this: MockWorld, method: MethodType, endpoint: string) {
  const request = this.requestPipeline();
  if (!request.steps) request.steps = [];
  request.steps.push({ method, endpoint });
});

Given(
  "request body pipeline include step {int} headers {string} value {string}",
  function (this: MockWorld, index: number, key: string, value: string) {
    const request = this.requestPipeline();
    if (!request.steps) request.steps = [];
    if (!request.steps[index]) request.steps[index] = {};
    if (!request.steps[index].headers) request.steps[index].headers = {};
    request.steps[index].headers[key] = value;
  },
);

Given(
  "request body pipeline include step {int} headers passthrough {string}",
  function (this: MockWorld, index: number, key: string) {
    const request = this.requestPipeline();
    if (!request.steps) request.steps = [];
    if (!request.steps[index]) request.steps[index] = {};
    const step = request.steps[index] as EndpointMethod;
    if (!step.passthrough) step.passthrough = [];
    step.passthrough.push(key);
  },
);

Given("request body pipeline include step {int} body {string}", function (this: MockWorld, index: number, body: string) {
  const request = this.requestPipeline();
  if (!request.steps) request.steps = [];
  if (!request.steps[index]) request.steps[index] = {};
  request.steps[index].body = body;
});

Given("request body pipeline include step {int} body JSON {json}", function (this: MockWorld, index: number, body: object) {
  const request = this.requestPipeline();
  if (!request.steps) request.steps = [];
  if (!request.steps[index]) request.steps[index] = {};
  request.steps[index].body = body;
});

Given("request body pipeline include step {int} cookies {boolean}", function (this: MockWorld, index: number, cookies: boolean) {
  const request = this.requestPipeline();
  if (!request.steps) request.steps = [];
  if (!request.steps[index]) request.steps[index] = {};
  const step = request.steps[index] as EndpointMethod;
  step.cookies = cookies;
});

Given("request body pipeline include step {int} cookies {string}", function (this: MockWorld, index: number, cookie: string) {
  const request = this.requestPipeline();
  if (!request.steps) request.steps = [];
  if (!request.steps[index]) request.steps[index] = {} as EndpointMethod;
  const step = request.steps[index] as EndpointMethod;
  if (typeof step.cookies !== "object") step.cookies = [];
  step.cookies.push(cookie);
});

When("requesting GET \\/", async function (this: MockWorld) {
  await API.get_status(this.request, this.response, this.platform);
});

When("requesting POST \\/", async function (this: MockWorld) {
  await API.post(this.request, this.response, this.platform);
});

Then("response status is {int}", function (this: MockWorld, status: number) {
  assert.strictEqual(this.response.status.mock.callCount(), 1);
  assert.strictEqual(this.response.status.mock.calls[0].arguments[0], status);
});

Then("response will be empty", function (this: MockWorld) {
  assert.strictEqual(this.response.send.mock.callCount(), 1);
  assert.deepStrictEqual(this.response.send.mock.calls[0].arguments[0], "");
});

Then("response {string} exists", function (this: MockWorld, key: string) {
  assert.ok(this.response.send.mock.calls[0].arguments[0][key], `Response '${key}' does not exist`);
});

Then("response {string} is {string}", function (this: MockWorld, key: string, val: string) {
  assert.strictEqual(this.response.send.mock.calls[0].arguments[0][key], val);
});

Then("platform trace was called", function (this: MockWorld) {
  assert.ok(this.platform.trace.mock.callCount() > 0, "Expected platform.trace to be called but it was not");
});

Then("platform trace was not called", function (this: MockWorld) {
  assert.strictEqual(this.platform.trace.mock.callCount(), 0, "Expected platform.trace to not be called but it was");
});

Then("platform warning was called", function (this: MockWorld) {
  assert.ok(this.platform.warn.mock.callCount() > 0, "Expected platform.warn to be called but it was not");
});

Then("platform warn was not called", function (this: MockWorld) {
  assert.strictEqual(this.platform.warn.mock.callCount(), 0, "Expected platform.warn to not be called but it was");
});
