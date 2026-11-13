import { describe, test } from "node:test";
import assert from "node:assert";

import Pipeline, { deleteHeader, getHeader, PipelineHeaders, setHeader, setStatus } from "../src/pipeline.js";

describe("getHeader", () => {
  test("should not find values with empty headers", () => {
    const val = getHeader({}, "nothing");
    assert.strictEqual(val, undefined);
  });
  test("should not find values with wrong header", () => {
    const val = getHeader({ anything: "value" }, "nothing");
    assert.strictEqual(val, undefined);
  });
  test("should find value with exact header", () => {
    const val = getHeader({ anything: "value" }, "anything");
    assert.strictEqual(val, "value");
  });
  test("should find value with undetermined case header", () => {
    const val = getHeader({ ANYTHING: "value" }, "anything");
    assert.strictEqual(val, "value");
  });
});

describe("setHeader", () => {
  test("should insert header with nothing in it", () => {
    const headers: PipelineHeaders = {};
    setHeader(headers, "Test", "Value");
    assert.strictEqual(headers["Test"], "Value");
  });
  test("should replace previous header even with different casing", () => {
    const headers: PipelineHeaders = { Test: "Value" };
    setHeader(headers, "tesT", "valuE");
    assert.strictEqual(headers["Test"], "valuE");
  });
  test("should add another header with different name", () => {
    const headers: PipelineHeaders = { Test: "Value" };
    setHeader(headers, "Anything", "anything");
    assert.strictEqual(headers["Test"], "Value");
    assert.strictEqual(headers["Anything"], "anything");
  });
});

describe("deleteHeader", () => {
  const len = (headers: PipelineHeaders) => Object.keys(headers).length;
  test("should not delete from empty", () => {
    const headers: PipelineHeaders = {};
    deleteHeader(headers, "Test");
    assert.strictEqual(len(headers), 0);
  });
  test("should delete even with different casing", () => {
    const headers: PipelineHeaders = { Test: "Value" };
    deleteHeader(headers, "tesT");
    assert.strictEqual(len(headers), 0);
  });
  test("should not delete if wrong spelling", () => {
    const headers: PipelineHeaders = { Test: "Value" };
    deleteHeader(headers, "Anything");
    assert.strictEqual(len(headers), 1);
  });
});

describe("setStatus", () => {
  test("without step should create object with message and status", () => {
    const pipeline = setStatus({} as Pipeline, "msg", 200);
    assert.strictEqual(pipeline.message, "msg");
    assert.strictEqual(pipeline.status, 200);
  });
  test("with step should create object with error and status", () => {
    const pipeline = setStatus({} as Pipeline, "msg", 200, "step");
    assert.ok(pipeline.error);
    const error = pipeline.error as { message: string; step: string };
    assert.strictEqual(error.message, "msg");
    assert.strictEqual(error.step, "step");
    assert.strictEqual(pipeline.status, 200);
  });
});
