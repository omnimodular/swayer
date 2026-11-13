# Swayer

Swayer is an HTTP service for running JSON pipelines. It executes HTTP requests
and JSON transformations in order, passing each step's output to the next.

## Quick start

Run the container image (Linux amd64):

```sh
docker run --rm -p 127.0.0.1:5000:5000 \
  -e SWAYER_CONFIG_HOST=0.0.0.0 \
  ghcr.io/omnimodular/swayer:latest
```

Check readiness:

```sh
curl http://localhost:5000/health
```

Submit a pipeline to `POST /`. This example transforms a JSON object without
calling an external service:

```sh
curl -i http://localhost:5000/ \
  -H 'Content-Type: application/json' \
  -d '{"name":"hello","steps":[{"body":{"message":"hello"}}]}'
```

For production deployments, select a tested image and pin it by digest.

## Pipelines

A pipeline contains a `steps` array and optionally `id`, `name`, `traceId`,
`headers`, `cookies`, `passthrough`, and `events`. The only supported protocol
version is `v3`; omitting `version` selects it automatically.

Each step can specify an HTTP `method`, `endpoint`, `headers`, and `body`.
For example:

```json
{
  "name": "process-document",
  "steps": [
    {
      "method": "POST",
      "endpoint": "https://processor.example.test/process",
      "body": { "message": "hello" }
    },
    {
      "method": "POST",
      "endpoint": "https://receiver.example.test/result"
    }
  ]
}
```

Replace the example endpoints with your services. Without a `method`, a step
performs an internal transformation: `body` sets the JSON object and `patch`
applies JSON Patch operations. See the [pipeline schema](specs/pipeline-spec.json)
for the complete request format.

Swayer generates an `id` when one is not supplied. For tracing, it uses `traceId`,
then `headers.x-om-trace-id`, then the pipeline ID.

### Outcomes and event hooks

The `X-Swayer-Outcome` response header identifies `success`, `retryable`, or
`permanent-failure`. Invalid pipelines receive HTTP 422. Completed responses
include the pipeline status and individual step responses.

Swayer invokes each external endpoint once per delivery; it does not retry
failed requests internally. Transport errors, timeouts, HTTP 408/429, and 5xx
responses are retryable by the caller. Other definitive 4xx failures are permanent.

Optional `events.precheck`, `events.success`, `events.retry`, and `events.failure`
hooks specify a `method`, `endpoint`, and optional `headers` and `body`. Retryable
outcomes invoke `retry`; permanent failures invoke `failure`.

## Configuration

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `SWAYER_CONFIG_HOST` | `127.0.0.1` | Listen address; use `0.0.0.0` inside a container. |
| `SWAYER_CONFIG_PORT` | `5000` | HTTP listen port. |
| `SWAYER_ENDPOINT_TIMEOUT_MS` | `135000` | Deadline for each endpoint invocation, in milliseconds. |
| `SWAYER_LOG_SUCCESS` | Disabled | Set to `true`, `1`, or `yes` to log successful pipeline summaries. |

`GET /` and `GET /health` return service status. `GET /metrics` exposes Prometheus
metrics. Failed pipelines are logged regardless of the success-log setting.

## Development

Use Node.js 22 and npm:

```sh
npm ci
npm run dev
```

Build and run the compiled service:

```sh
npm run build
npm start
```

Run type checking, unit tests, and behavior tests with `npm test`. The repository
also provides `npm run lint` and `npm run fmt`.

## Container builds

GitHub Actions tests the code, builds a `linux/amd64` production candidate,
checks it, and publishes that same image to `ghcr.io/omnimodular/swayer`.
Branch builds publish `latest` and `sha-<full-commit>`; Git tag builds publish
the corresponding tag and commit tag. Pull requests run checks without publishing.

## Protocol compatibility

Only v3 is supported. To migrate older payloads, use `steps` instead of
`pipeline` and either omit `version` or set it to `"v3"`. Explicit v1/v2 or
unknown versions, and any payload containing the legacy `pipeline` field,
receive HTTP 422 with `X-Swayer-Outcome: permanent-failure` before any steps
or event hooks run. There is no compatibility mode or automatic conversion.

### v3 header handling

  Response bodies are decompressed (gzip, deflate, br) before they are passed
  to the next step. Between steps, v3 carries over `Content-Type` and any
  *passthrough* headers from the previous response.

  `Content-Length` is never forwarded. It describes the previous response's
  bytes on the wire, not the request being sent; it is computed from the body
  that is actually sent, and omitted when there is none.

  A step with its own *body* does not inherit the previous `Content-Type`.
  An object body is sent as JSON with `application/json`, and a string body
  as-is with `text/plain;charset=UTF-8`, unless top or step headers set one.

  Event hooks use the same request handling as v3 steps.

## Third-party notices

Dependency notices are listed in [THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt).
After installing dependencies with `npm ci`, run `npm run licenses` to regenerate
them. Third-party packages retain their respective licenses.

## License

[MIT](LICENSE) © Omnimodular AB.
