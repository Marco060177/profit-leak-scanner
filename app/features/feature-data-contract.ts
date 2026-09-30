export type FeatureMoney = Readonly<{
  amountAtoms: bigint;
  amountScale: number;
  currencyCode: string;
}>;

export type FeatureQuantity = Readonly<{
  quantityAtoms: bigint;
  quantityScale: number;
}>;

export type FeatureSourceDescriptor = Readonly<{
  channel: string;
  sourceSystem: string;
  adapterVersion: string;
}>;

export type FeatureEconomicPeriod = Readonly<{
  startInclusive: Date;
  endExclusive: Date;
}>;

export type FeatureAvailability =
  | Readonly<{ status: "AVAILABLE" }>
  | Readonly<{ status: "UNAVAILABLE"; reasonCodes: readonly string[] }>
  | Readonly<{ status: "NOT_APPLICABLE"; reasonCodes?: readonly string[] }>;

export type FeatureOptionalMoney =
  | Readonly<{ status: "AVAILABLE"; value: FeatureMoney }>
  | Readonly<{ status: "UNAVAILABLE"; reasonCodes: readonly string[] }>
  | Readonly<{ status: "NOT_APPLICABLE"; reasonCodes?: readonly string[] }>;

export type FeatureSummaryEconomics = Readonly<{
  revenue: FeatureOptionalMoney;
  cogs: FeatureOptionalMoney;
  profit: FeatureOptionalMoney;
  fees: FeatureOptionalMoney;
  tax: FeatureOptionalMoney;
  discounts: FeatureOptionalMoney;
  refunds: FeatureOptionalMoney;
  shippingRevenue: FeatureOptionalMoney;
  otherContribution: FeatureOptionalMoney;
}>;

export type FeatureProductEconomics = Readonly<{
  productId: string | null;
  skuId: string | null;
  title: string | null;
  quantity: FeatureQuantity;
  revenue: FeatureOptionalMoney;
  cogs: FeatureOptionalMoney;
  profit: FeatureOptionalMoney;
  discounts: FeatureOptionalMoney;
  refunds: FeatureOptionalMoney;
  fees: FeatureOptionalMoney;
  tax: FeatureOptionalMoney;
}>;

export type FeatureTrendPoint = Readonly<{
  date: string;
  economics: FeatureSummaryEconomics;
}>;

export type FeaturePeriodData = Readonly<{
  period: FeatureEconomicPeriod;
  summary: FeatureSummaryEconomics;
  products: readonly FeatureProductEconomics[];
  trend: readonly FeatureTrendPoint[];
}>;

export type FeatureCompleteness = Readonly<{
  status: "COMPLETE" | "PROVISIONAL" | "DEGRADED" | "NO_OBSERVATIONS";
  reasonCodes: readonly string[];
}>;

export type FeatureCapabilities = Readonly<{
  productEconomics: FeatureAvailability;
  trend: FeatureAvailability;
  periodComparison: FeatureAvailability;
  fees: FeatureAvailability;
  tax: FeatureAvailability;
  refunds: FeatureAvailability;
  assumptions: FeatureAvailability;
  orderLevelAllocation: FeatureAvailability;
}>;

export type FeatureProvenance = Readonly<{
  fingerprints: readonly string[];
  references: readonly Readonly<{ kind: string; id: string }>[];
}>;

type FeatureIdentity = Readonly<{
  accountId: string;
  channelConnectionId: string;
  source: FeatureSourceDescriptor;
}>;

export type FeatureDataReady = FeatureIdentity & Readonly<{
  status: "READY";
  currencyCode: string;
  current: FeaturePeriodData;
  previous: FeaturePeriodData | null;
  completeness: FeatureCompleteness;
  capabilities: FeatureCapabilities;
  provenance: FeatureProvenance;
}>;

export type FeatureSafeDiagnosticContext = Readonly<Record<
  string,
  string | number | boolean | null
>>;

export type FeatureDataBlocked = FeatureIdentity & Readonly<{
  status: "BLOCKED";
  reasonCodes: readonly string[];
  diagnosticContext?: FeatureSafeDiagnosticContext;
}>;

export type FeatureData = FeatureDataReady | FeatureDataBlocked;
