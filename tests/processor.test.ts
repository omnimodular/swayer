import { describe, test, before, after } from "node:test";
import assert from "node:assert";
import http from "node:http";
import { AddressInfo } from "node:net";
import zlib from "node:zlib";
import fetch from "node-fetch";

import processor from "../src/processor.js";
import Pipeline from "../src/pipeline.js";
import Platform from "../src/platform.js";

interface Received {
  headers: http.IncomingHttpHeaders;
  body: string;
}

const payload = JSON.stringify({ document: "x".repeat(4096) });

describe("processor with gzip-encoded responses", () => {
  let server: http.Server;
  let base: string;
  const received: Received[] = [];

  before(async () => {
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        if (req.url === "/blob") {
          const gzipped = zlib.gzipSync(payload);
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Content-Encoding": "gzip",
            "Content-Length": gzipped.length,
          });
          res.end(gzipped);
        } else {
          received.push({ headers: req.headers, body: Buffer.concat(chunks).toString() });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end("{}");
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(() => {
    server.close();
  });

  for (const version of [undefined, "v3"]) {
    test(`${version} forwards the decompressed body with its actual length`, async () => {
      received.length = 0;
      const platform: Platform = {
        fetch,
        log: () => {},
        logs: () => {},
        trace: () => {},
        warn: () => {},
        error: () => {},
      };
      const request = {
        id: `gzip-${version}`,
        version,
        name: "gzip",
        steps: [
          { method: "GET", endpoint: `${base}/blob` },
          { method: "POST", endpoint: `${base}/sink` },
        ],
      } as unknown as Pipeline;

      const result = await processor(request, platform);

      assert.strictEqual(result.status, 200, JSON.stringify(result.error));
      assert.strictEqual(received.length, 1);
      assert.strictEqual(received[0].body, payload);
      assert.strictEqual(received[0].headers["content-length"], String(Buffer.byteLength(payload)));
      assert.strictEqual(received[0].headers["content-type"], "application/json");
    });
  }
});
