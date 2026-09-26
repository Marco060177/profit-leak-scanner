import { createHash } from "node:crypto";

function canonical(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    const values = value.map(canonical);
    return values.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}

export function canonicalEconomicJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}

export function canonicalEconomicFingerprint(value: unknown): string {
  return createHash("sha256").update(canonicalEconomicJson(value)).digest("hex");
}
