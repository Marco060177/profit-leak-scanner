import assert from "node:assert/strict";

import { createServerPerformanceTrace } from "../../app/utils/server-performance.server";

const clock = [0, 1, 6, 10];
const events: Array<Record<string, unknown>> = [];
const trace = createServerPerformanceTrace("dashboard-loader", {
  now: () => clock.shift() ?? 10,
  traceId: "safe-test-trace",
  log: (event) => events.push(event),
});

assert.equal(await trace.measure("billing", async () => "GROWTH"), "GROWTH");
trace.finish("ok");
trace.finish("error");

assert.equal(events.length, 1, "a trace must be emitted exactly once");
assert.deepEqual(events[0], {
  event: "server_performance",
  operation: "dashboard-loader",
  traceId: "safe-test-trace",
  outcome: "ok",
  totalDurationMs: 10,
  phases: { billing: { count: 1, durationMs: 5 } },
});
assert.doesNotMatch(JSON.stringify(events[0]), /token|session|shop|hmac/i);

console.log("Server performance timing tests passed");
