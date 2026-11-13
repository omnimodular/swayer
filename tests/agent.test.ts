import { describe, test } from "node:test";
import assert from "node:assert";

import { getAgent, httpAgent, httpsAgent } from "../src/agent.js";

describe("agent", () => {
  test("returns http agent for http URLs", () => {
    assert.strictEqual(getAgent("http://api/test"), httpAgent);
  });

  test("returns https agent for https URLs", () => {
    assert.strictEqual(getAgent("https://api/test"), httpsAgent);
  });

  test("httpAgent has keepAlive enabled", () => {
    assert.strictEqual((httpAgent as any).keepAlive, true);
  });

  test("httpsAgent has keepAlive enabled", () => {
    assert.strictEqual((httpsAgent as any).keepAlive, true);
  });
});
