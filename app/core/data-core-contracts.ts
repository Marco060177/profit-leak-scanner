export const CAPABILITY_STATUSES = [
  "AVAILABLE", "NOT_APPLICABLE", "NOT_AUTHORIZED", "NOT_SUPPORTED", "TEMPORARILY_UNAVAILABLE",
] as const;
export type CapabilityStatus = typeof CAPABILITY_STATUSES[number];

export const DATASET_QUALITY_STATUSES = ["SYNCING", "PROVISIONAL", "COMPLETE", "DEGRADED", "ERROR"] as const;
export type DatasetQualityStatus = typeof DATASET_QUALITY_STATUSES[number];

export function validateCoverageState(input: {
  capabilityStatus: string; datasetQualityStatus: string; completenessBps: number | null;
}) {
  if (!CAPABILITY_STATUSES.includes(input.capabilityStatus as CapabilityStatus) ||
      !DATASET_QUALITY_STATUSES.includes(input.datasetQualityStatus as DatasetQualityStatus)) {
    throw new Error("Unsupported coverage state");
  }
  if (input.completenessBps !== null && (!Number.isInteger(input.completenessBps) ||
      input.completenessBps < 0 || input.completenessBps > 10000)) throw new Error("Invalid completeness");
  if (input.capabilityStatus !== "AVAILABLE" && input.completenessBps !== null) {
    throw new Error("Unavailable capability must not become numeric zero or completeness");
  }
  return input;
}

/** No marketplace is a real, stable scope, never a nullable unique-key part. */
export const NO_MARKETPLACE_SCOPE = "@none";
export function marketplaceScopeKey(marketplaceId: string | null): string {
  if (marketplaceId === null) return NO_MARKETPLACE_SCOPE;
  if (!marketplaceId || marketplaceId === NO_MARKETPLACE_SCOPE) throw new Error("Invalid marketplace identity");
  return marketplaceId;
}

export type FinancialAuthorityScope = {
  authorityScopeKey: string;
  economicComponentFamily: string;
  provisionalSourceAuthority: string;
  actualSourceAuthority: string;
  coverageState: "NO_ACTUAL" | "ACTUAL_INCOMPLETE" | "ACTUAL_COMPLETE" | "ACTUAL_UNKNOWN";
};

/** D1 contract only. D2 must not add provisional and actual amounts blindly. */
export function selectFinancialAuthority(scope: FinancialAuthorityScope):
  "PROVISIONAL" | "ACTUAL" | "BLOCKED" {
  if (!scope.authorityScopeKey || !scope.economicComponentFamily ||
      !scope.provisionalSourceAuthority || !scope.actualSourceAuthority ||
      scope.provisionalSourceAuthority === scope.actualSourceAuthority) {
    throw new Error("Invalid financial authority scope");
  }
  if (scope.coverageState === "NO_ACTUAL" || scope.coverageState === "ACTUAL_INCOMPLETE") return "PROVISIONAL";
  if (scope.coverageState === "ACTUAL_COMPLETE") return "ACTUAL";
  if (scope.coverageState === "ACTUAL_UNKNOWN") return "BLOCKED";
  throw new Error("Unknown actual coverage");
}
