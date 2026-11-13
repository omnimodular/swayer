import prometheus from "prom-client";

export const pipeline_time = new prometheus.Counter({
  name: "pipeline_time",
  help: "Pipeline accumulated time",
  labelNames: ["name"],
});

export const pipeline_count = new prometheus.Counter({
  name: "pipeline_count",
  help: "Pipeline amount",
  labelNames: ["name", "status"],
});
