import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createNotice } = require("../tools/create-categorized-notice-from-tree.cjs");

test("license notice classifies scoped packages and keeps different versions separate", () => {
  const metadata: Record<string, object> = {
    scoped: { license: "MIT", repository: { url: "https://example.com/scoped" } },
    current: { license: "Apache-2.0", repository: "https://example.com/current" },
    older: { license: "BSD-3-Clause" },
  };
  const notice = createNotice(
    { dependencies: { library: "2" }, devDependencies: { "@scope/tool": "1" } },
    { dependencies: {
      "@scope/tool": { version: "1.0.0", path: "scoped", dependencies: {
        library: { version: "1.0.0", path: "older" },
      } },
      library: { version: "2.0.0", path: "current" },
      "optional-uninstalled": {},
    } },
    (path: string) => metadata[path],
    "2026-11-13",
  );
  const [production, rest] = notice.split("DEVELOPMENT (not in production)");
  const [development, indirect] = rest.split("INDIRECT DEPENDENCIES (Transitive Dependencies)");
  assert.match(production, /Package: library@2\.0\.0\nLicense: Apache-2\.0/);
  assert.match(development, /Package: @scope\/tool@1\.0\.0\nLicense: MIT\nRepository: https:\/\/example.com\/scoped/);
  assert.match(indirect, /Package: library@1\.0\.0\nLicense: BSD-3-Clause\nRepository: UNKNOWN/);
  assert.equal((notice.match(/Package: /g) || []).length, 3);
  assert.doesNotMatch(notice, /optional-uninstalled|undefined/);
});

test("license notice traverses repeated versions and deduplicates their entries", () => {
  const notice = createNotice({}, { dependencies: {
    first: { version: "1", path: "first", dependencies: {
      shared: { version: "1", path: "shared" },
    } },
    second: { version: "1", path: "second", dependencies: {
      shared: { version: "1", path: "shared", dependencies: {
        nested: { version: "1", path: "nested" },
      } },
    } },
  } }, () => ({}));
  assert.equal((notice.match(/Package: shared@1\n/g) || []).length, 1);
  assert.match(notice, /Package: nested@1\nLicense: UNKNOWN/);
});

test("license notice supports legacy license metadata", () => {
  const notice = createNotice({}, { dependencies: {
    legacy: { version: "1", path: "legacy" },
  } }, () => ({ licenses: [{ type: "MIT" }, { type: "BSD-2-Clause" }] }));
  assert.match(notice, /License: MIT OR BSD-2-Clause/);
});
