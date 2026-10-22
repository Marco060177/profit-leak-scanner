import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

export type PerformanceOperation =
  | "app-shell-loader"
  | "dashboard-loader"
  | "shopify-auth-callback"
  | "shopify-after-auth";

type PhaseTiming = { count: number; durationMs: number };

export type ServerPerformanceTrace = {
  measure<T>(phase: string, task: () => Promise<T>): Promise<T>;
  start(phase: string): () => void;
  finish(outcome: "ok" | "error"): void;
};

type TraceOptions = {
  now?: () => number;
  log?: (event: Record<string, unknown>) => void;
  traceId?: string;
};

export function createServerPerformanceTrace(
  operation: PerformanceOperation,
  options: TraceOptions = {},
): ServerPerformanceTrace {
  const now = options.now ?? (() => performance.now());
  const log = options.log ?? ((event) => console.info("[PERFORMANCE]", JSON.stringify(event)));
  const traceId = options.traceId ?? randomUUID();
  const startedAt = now();
  const phases: Record<string, PhaseTiming> = {};
  let finished = false;

  const record = (phase: string, durationMs: number) => {
    const previous = phases[phase] ?? { count: 0, durationMs: 0 };
    phases[phase] = {
      count: previous.count + 1,
      durationMs: Math.round((previous.durationMs + durationMs) * 100) / 100,
    };
  };

  const start = (phase: string) => {
    const phaseStartedAt = now();
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      record(phase, Math.max(0, now() - phaseStartedAt));
    };
  };

  return {
    async measure<T>(phase: string, task: () => Promise<T>) {
      const stop = start(phase);
      try {
        return await task();
      } finally {
        stop();
      }
    },
    start,
    finish(outcome) {
      if (finished) return;
      finished = true;
      log({
        event: "server_performance",
        operation,
        traceId,
        outcome,
        totalDurationMs: Math.round(Math.max(0, now() - startedAt) * 100) / 100,
        phases,
      });
    },
  };
}
