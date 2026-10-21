export type TaxRateValidationCode =
  | "MISSING"
  | "EMPTY"
  | "INVALID_NUMBER"
  | "OUT_OF_RANGE"
  | "INVALID_PRECISION";

export class TaxRateValidationError extends Error {
  readonly field: string;
  readonly code: TaxRateValidationCode;

  constructor(
    field: string,
    code: TaxRateValidationCode,
    message: string,
  ) {
    super(message);
    this.name = "TaxRateValidationError";
    this.field = field;
    this.code = code;
  }
}

export function parseTaxRate(
  value: FormDataEntryValue | null,
  field: string,
  maxDecimalPlaces: number,
) {
  if (value === null) {
    throw new TaxRateValidationError(field, "MISSING", `${field} is required.`);
  }
  if (typeof value !== "string") {
    throw new TaxRateValidationError(field, "INVALID_NUMBER", `${field} must be numeric.`);
  }

  const normalized = value.trim();
  if (normalized === "") {
    throw new TaxRateValidationError(field, "EMPTY", `${field} cannot be empty.`);
  }
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
    throw new TaxRateValidationError(field, "INVALID_NUMBER", `${field} must be numeric.`);
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new TaxRateValidationError(field, "INVALID_NUMBER", `${field} must be numeric.`);
  }
  if (parsed < 0 || parsed > 100) {
    throw new TaxRateValidationError(
      field,
      "OUT_OF_RANGE",
      `${field} must be between 0 and 100.`,
    );
  }

  const decimals = normalized.includes(".")
    ? normalized.replace(/0+$/, "").split(".")[1]?.length ?? 0
    : 0;
  if (decimals > maxDecimalPlaces) {
    throw new TaxRateValidationError(
      field,
      "INVALID_PRECISION",
      `${field} supports at most ${maxDecimalPlaces} decimal place${maxDecimalPlaces === 1 ? "" : "s"}.`,
    );
  }

  return parsed;
}

export function getInitialTaxRate(
  savedValue: number | null | undefined,
  countryDefaultRate: number,
  configured: boolean,
) {
  return configured && savedValue != null ? savedValue : countryDefaultRate;
}

export type StandardTaxSettings = {
  defaultVatRatePct: number;
  pricesIncludeVat: boolean;
  inputVatRecoveryPct: number;
  shippingIncludeVat: boolean;
  shippingVatRatePct: number;
};

export function transitionStandardTaxSettings({
  wasStandard,
  isStandard,
  current,
  savedStandard,
}: {
  wasStandard: boolean;
  isStandard: boolean;
  current: StandardTaxSettings;
  savedStandard: StandardTaxSettings;
}): { current: StandardTaxSettings; savedStandard: StandardTaxSettings } {
  if (wasStandard && !isStandard) {
    return {
      savedStandard: current,
      current: {
        defaultVatRatePct: 0,
        pricesIncludeVat: false,
        inputVatRecoveryPct: 0,
        shippingIncludeVat: false,
        shippingVatRatePct: 0,
      },
    };
  }
  if (!wasStandard && isStandard) {
    return { current: savedStandard, savedStandard };
  }
  return { current, savedStandard };
}

export async function persistTaxProfile(
  save: () => Promise<unknown>,
): Promise<Response> {
  try {
    await save();
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) throw error;
    return Response.json(
      {
        ok: false,
        errorKind: "persistence",
        error: "Unable to save the Tax Profile. Please try again.",
      },
      { status: 500 },
    );
  }
}
