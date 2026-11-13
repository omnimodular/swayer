import config from "config";
import express from "express";
import { randomUUID } from "crypto";

import "./sig.js";
import API from "./api.js";
import { handleDisconnect } from "./disconnect.js";

const portEnv = process.env.SWAYER_CONFIG_PORT;
const parsedPort = portEnv ? parseInt(portEnv, 10) : NaN;
const port: number = !isNaN(parsedPort) ? parsedPort : (config.get("port") as number) || 5000;
const host: string = process.env.SWAYER_CONFIG_HOST || config.get("host") || "127.0.0.1";
const app = express();

app.use(express.json());

/**
 * Wrap a function use to reduce cohesion with external dependencies
 * @param fn Function to wrap and call for each request
 * @returns A function to pass to express endpoint
 */
function adapter(fn: API.FuncType) {
  return async (req: express.Request, res: express.Response) => {
    await fn(req, res);
  };
}

app.get("/metrics", adapter(API.get_metrics));

app.get("/health", adapter(API.get_status));

app.get("/", adapter(API.get_status));

app.post("/", async (req: express.Request, res: express.Response) => {
  let pipelineId: string | null = null;
  let completed = false;

  // Extract or generate pipeline ID from request body before processing
  if (req.body?.id) {
    pipelineId = req.body.id;
  } else {
    pipelineId = randomUUID();
    req.body.id = pipelineId;
  }

  // Detect client disconnect
  res.on("close", async () => {
    if (!completed && !res.writableEnded && pipelineId) {
      await handleDisconnect(pipelineId);
    }
  });

  try {
    await API.post(req, res);
  } finally {
    completed = true;
  }
});

console.log(`Listening on ${host}:${port}`);
app.listen(port, host);
