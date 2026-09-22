import {
  calculateProductEconomics as calculateProductActual,
  calculateProfitEngine as calculateProfitActual,
} from "../../app/core/profit-engine";

export function calculateProductEconomics(...args: Parameters<typeof calculateProductActual>) {
  return calculateProductActual(...args);
}

export function calculateProfitEngine(...args: Parameters<typeof calculateProfitActual>) {
  const counters = globalThis as typeof globalThis & { __profitEngineCalls?: number };
  counters.__profitEngineCalls = (counters.__profitEngineCalls ?? 0) + 1;
  return calculateProfitActual(...args);
}
