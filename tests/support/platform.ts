import { Before, After, ITestCaseHookParameter, Status } from "@cucumber/cucumber";
import { mock } from "node:test";
import { Response } from "node-fetch";

import MockWorld from "./world.js";
import { log } from "../../src/utils.js";

Before(function (this: MockWorld) {
  this.platform = {
    fetch: mock.fn(async () => {
      return new Response();
    }),
    log: mock.fn(() => {}),
    logs: mock.fn(() => {}),
    trace: mock.fn(() => {}),
    warn: mock.fn(() => {}),
    error: mock.fn(() => {}),
  };
});

// Make the logging easier, by outputting it when failed
After({ name: "Print failure" }, function (this: MockWorld, scenario: ITestCaseHookParameter) {
  if (scenario.result?.status === Status.FAILED) {
    console.log("\n==== FAILURE:", scenario.pickle.name);
    for (const call of this.platform.log.mock.calls) {
      console.log("log:", ...call.arguments);
    }
    for (const call of this.platform.logs.mock.calls) {
      log("logs:", ...call.arguments);
    }
    for (const call of this.platform.trace.mock.calls) {
      console.trace("trace:", ...call.arguments);
    }
    for (const call of this.platform.warn.mock.calls) {
      console.warn("warn:", ...call.arguments);
    }
    for (const call of this.platform.error.mock.calls) {
      console.error("error:", ...call.arguments);
    }
    if (this.response.send.mock.callCount() > 0) {
      console.log("send:", ...this.response.send.mock.calls[0].arguments);
    }
    if (this.response.end.mock.callCount() > 0) {
      console.log("end:", ...this.response.end.mock.calls[0].arguments);
    }
  }
});
