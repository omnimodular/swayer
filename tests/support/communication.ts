import { Before } from "@cucumber/cucumber";
import { mock } from "node:test";

import MockWorld from "./world.js";

Before(function (this: MockWorld) {
  this.request = {
    headers: {},
    body: {},
  };
  this.response = {} as MockWorld["response"];
  this.response.set = mock.fn(({}: string, {}: string) => {
    return this.response;
  });
  this.response.status = mock.fn(({}: number) => {
    return this.response;
  });
  this.response.send = mock.fn(({}: any) => {
    return this.response;
  });
  this.response.end = mock.fn(({}: any) => {
    return this.response;
  });
});
