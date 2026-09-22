import { buildCanonicalProfitResult as buildActual } from "../../app/core/canonical-profit-result";

export function buildCanonicalProfitResult(...args: Parameters<typeof buildActual>) {
  const counters = globalThis as typeof globalThis & { __canonicalBuildCalls?: number };
  counters.__canonicalBuildCalls = (counters.__canonicalBuildCalls ?? 0) + 1;
  return buildActual(...args);
}
