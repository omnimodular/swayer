import { IWorldOptions, World, setWorldConstructor } from "@cucumber/cucumber";
import { Mock } from "node:test";

import API from "../../src/communication.js";
import Platform from "../../src/platform.js";
import Pipeline from "../../src/pipeline.js";

interface EndpointData {
  data?: string;
  status?: number;
  error?: Error;
  headers?: Record<string, string>;
  cookies?: string[];
}

type MockableMethod<T> = T extends (...args: infer Args) => infer Return ? Mock<(...args: Args) => Return> : T;

export default class MockWorld extends World {
  // Remove mutable fields to make them testable
  request!: { -readonly [k in keyof API.Request]: API.Request[k] };
  // Mock typedef each method to be mocked
  response!: { [k in keyof API.Response]: Mock<API.Response[k]> };
  platform!: { [k in keyof Platform]: MockableMethod<Platform[k]> };

  endpoints!: { [endpoint: string]: EndpointData };

  constructor(props: IWorldOptions) {
    super(props);
  }

  requestPipeline(): Pipeline {
    return this.request.body as Pipeline;
  }
  requestBody<Key extends string, Value>(): Record<Key, Value> {
    return this.request.body as Record<Key, Value>;
  }
}

setWorldConstructor(MockWorld);
