import prometheus from "prom-client";
import Ajv from "ajv";
import { randomUUID } from "crypto";
import fs from "node:fs";
import fetch from "node-fetch";

import Platform from "./platform.js";
import Pipeline from "./pipeline.js";
import processor from "./processor.js";
import Communication from "./communication.js";
import { log } from "./utils.js";
import { getAgent } from "./agent.js";
import { pipelineCompletedLog, pipelineFailureLog, pipelineLogFields, shouldLogSuccess } from "./observability.js";
import { isRetryableDeliveryError, isRetryableHttpStatus } from "./delivery.js";

import schema from "../specs/pipeline-spec.json" with { type: "json" };

const ajv = new Ajv.default({
  allErrors: true,
  loadSchema: async (uri: string): Promise<Ajv.AnySchemaObject> => {
    if (uri.startsWith("local://")) {
      const file = uri.slice(8);
      const data = fs.readFileSync(`specs/${file}`, "utf8");
      return JSON.parse(data);
    }
    throw new Error(`Unknown protocol from '${uri}'`);
  },
});
const validate = await ajv.compileAsync(schema);

const defaultPlatform: Platform = {
  fetch,
  log: console.log,
  logs: log,
  trace: console.trace,
  warn: console.warn,
  error: console.error,
  getAgent,
};

namespace API {
  export type FuncType = (request: Communication.Request, response: Communication.Response, platform?: Platform) => Promise<void>;

  export async function get_metrics(
    {}: Communication.Request,
    res: Communication.Response,
    {}: Platform = defaultPlatform,
  ): Promise<void> {
    try {
      res.set("Content-Type", prometheus.register.contentType);
      res.end(await prometheus.register.metrics());
    } catch (err) {
      res.status(500).end(err);
    }
  }

  export async function get_status(
    {}: Communication.Request,
    res: Communication.Response,
    {}: Platform = defaultPlatform,
  ): Promise<void> {
    const status = "pass";
    res.status(200).send({ status });
  }

  export async function post(
    req: Communication.Request,
    res: Communication.Response,
    platform: Platform = defaultPlatform,
  ): Promise<void> {
    if (!validate(req.body)) {
      platform.logs({ level: "warning", ...req.body, schema: validate.errors });
      res.set("X-Swayer-Outcome", "permanent-failure");
      res.status(422).send({ status: 422, message: "Does not follow JSON schema", schema: validate.errors });
      return;
    }
    const request = req.body as unknown as Pipeline;
    request.version = "v3";
    if (request.id == null) {
      request.id = randomUUID();
    }
    let response: Pipeline;
    try {
      response = await processor(request, platform);
    } catch (error: any) {
      const retryable = isRetryableDeliveryError(error);
      const status = retryable ? 503 : 400;
      const outcome = retryable ? "retryable" : "permanent-failure";
      platform.logs({
        event: "swayer.pipeline.failed",
        level: "warning",
        ...pipelineLogFields(request),
        status,
        outcome,
        message: error.message,
      });
      res.set("X-Swayer-Outcome", outcome);
      res.status(status).send(error);
      return;
    }
    const outcome =
      200 <= response.status && response.status < 300
        ? "success"
        : isRetryableHttpStatus(response.status)
          ? "retryable"
          : "permanent-failure";
    res.set("X-Swayer-Outcome", outcome);
    res.status(response.status).send(response);
    if (200 <= response.status && response.status < 300) {
      if (shouldLogSuccess()) {
        platform.logs(pipelineCompletedLog(response));
      }
    } else {
      platform.logs(pipelineFailureLog(response));
    }
  }
}

export default API;
