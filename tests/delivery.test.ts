import { describe, test } from "node:test";
import assert from "node:assert";

import { isRetryableDeliveryError, isRetryableHttpStatus, PermanentDeliveryError } from "../src/delivery.js";

describe("delivery status contract", () => {
  test("classifies unknown and transient outcomes as retryable", () => {
    for (const status of [408, 429, 500, 502, 503, 504]) {
      assert.strictEqual(isRetryableHttpStatus(status), true, `${status}`);
    }
  });

  test("classifies permanent client outcomes as definitive", () => {
    for (const status of [400, 401, 403, 404, 409, 422]) {
      assert.strictEqual(isRetryableHttpStatus(status), false, `${status}`);
    }
  });

  test("keeps unknown execution errors retryable", () => {
    assert.strictEqual(isRetryableDeliveryError(new Error("connection reset")), true);
  });

  test("treats request and configuration errors as permanent", () => {
    assert.strictEqual(isRetryableDeliveryError(new TypeError("Invalid URL")), false);
    assert.strictEqual(isRetryableDeliveryError(new PermanentDeliveryError("invalid timeout")), false);
  });
});
