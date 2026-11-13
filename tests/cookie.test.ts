import { describe, test } from "node:test";
import { appendCookies, getCookieHeader } from "../src/cookie.js";
import assert from "node:assert";

describe("appendCookies", () => {
  test("should add a cookie with key and value", () => {
    const cookies = {};
    appendCookies(cookies, ["key=value"]);
    assert.ok("key" in cookies);
    assert.strictEqual(cookies["key"], "value");
  });
  test("should add a cookie with attributes", () => {
    const cookies = {};
    appendCookies(cookies, ["key=value; Domain=test"]);
    assert.ok("key" in cookies);
    assert.strictEqual(cookies["key"], "value");
  });
  test("should add a cookie with quotes", () => {
    const cookies = {};
    appendCookies(cookies, ['key="value"']);
    assert.ok("key" in cookies);
    assert.strictEqual(cookies["key"], '"value"');
  });
  test("should not add a cookie with missing key", () => {
    const cookies = {};
    appendCookies(cookies, ["key"]);
    assert.ok(!("key" in cookies));
  });
  test("should not add a cookie with nothing", () => {
    const cookies = {};
    appendCookies(cookies, [""]);
    assert.ok(!("key" in cookies));
  });
  test("should add two cookies", () => {
    const cookies = {};
    appendCookies(cookies, ["key=value", "key2=value"]);
    assert.ok("key" in cookies);
    assert.ok("key2" in cookies);
    assert.strictEqual(cookies["key"], "value");
    assert.strictEqual(cookies["key2"], "value");
  });
});

describe("getCookieHeader", () => {
  test("should retrieve cookie", () => {
    const cookies = { key: "value" };
    const cookie = getCookieHeader(cookies, true);
    assert.strictEqual(cookie, "key=value");
  });
  test("should retrieve cookies", () => {
    const cookies = { key: "value", key2: "value2" };
    const cookie = getCookieHeader(cookies, true);
    assert.strictEqual(cookie, "key=value; key2=value2");
  });
  test("should retrieve no cookies if empty", () => {
    const cookies = {};
    const cookie = getCookieHeader(cookies, true);
    assert.strictEqual(cookie, "");
  });
  test("should retrieve no cookies if false", () => {
    const cookies = { key: "value", key2: "value2" };
    const cookie = getCookieHeader(cookies, false);
    assert.strictEqual(cookie, "");
  });
  test("should retrieve one cookie if specified", () => {
    const cookies = { key: "value", key2: "value2" };
    const cookie = getCookieHeader(cookies, ["key"]);
    assert.strictEqual(cookie, "key=value");
  });
});
