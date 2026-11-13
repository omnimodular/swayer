import { Given } from "@cucumber/cucumber";

import MockWorld from "../support/world.js";

function createEventsField(this: MockWorld) {
  const request = this.requestPipeline();
  if (request.events) return;
  request.events = {};
}

Given("request body event {word} exists", function (this: MockWorld, event: string) {
  createEventsField.call(this);
  const events = this.requestPipeline().events as { [k: string]: any };
  events[event] = {
    endpoint: event,
  };
});

Given("request body event {word} body {string}", function (this: MockWorld, event: string, body: string) {
  createEventsField.call(this);
  const events = this.requestPipeline().events as { [k: string]: any };
  events[event] = {
    endpoint: event,
    body,
  };
});
