import { projectLegacyMarginV1 as projectActual } from "../../app/core/legacy-margin-projection";

export function projectLegacyMarginV1(...args: Parameters<typeof projectActual>) {
  const counters = globalThis as typeof globalThis & { __legacyProjectionCalls?: number };
  counters.__legacyProjectionCalls = (counters.__legacyProjectionCalls ?? 0) + 1;
  return projectActual(...args);
}
