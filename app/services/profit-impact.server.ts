import { Prisma } from "@prisma/client";

import prisma from "~/db.server";
import {
  actionTypeRequiresProduct,
  assertProfitImpactTransition,
  isProfitImpactActionType,
  isProfitImpactConfidenceLevel,
  isProfitImpactMeasurementType,
  isProfitImpactSourceModule,
  isProfitImpactStatus,
  isProfitImpactTerminalStatus,
  type ProfitImpactActionType,
  type ProfitImpactConfidenceLevel,
  type ProfitImpactMeasurementType,
  type ProfitImpactSourceModule,
  type ProfitImpactStatus,
} from "~/utils/profit-impact";

const MAX_TITLE_LENGTH = 160;
const MAX_DESCRIPTION_LENGTH = 2_000;
const MAX_NOTE_LENGTH = 2_000;
const MAX_METADATA_BYTES = 16_384;
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
const VALID_MEASUREMENT_WINDOW_DAYS = 14;

function domainError(message: string, status = 400) {
  return new Response(message, { status });
}

function requiredText(value: unknown, field: string, maxLength: number) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw domainError(`${field} is required.`);
  if (normalized.length > maxLength) {
    throw domainError(`${field} is too long.`);
  }
  return normalized;
}

function optionalText(value: unknown, field: string, maxLength: number) {
  if (value === null || value === undefined || value === "") return null;
  return requiredText(value, field, maxLength);
}

function optionalFiniteNumber(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw domainError(`${field} must be a finite number.`);
  }
  return value;
}

function finiteNumber(value: unknown, field: string) {
  const normalized = optionalFiniteNumber(value, field);
  if (normalized === null) throw domainError(`${field} is required.`);
  return normalized;
}

function integerInRange(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw domainError(`${field} is invalid.`);
  }
  return value;
}

function serializeOptionalJson(value: unknown, field: string) {
  if (value === null || value === undefined) return null;

  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw domainError(`${field} must be JSON serializable.`);
  }

  if (!serialized) throw domainError(`${field} must be JSON serializable.`);
  if (Buffer.byteLength(serialized, "utf8") > MAX_METADATA_BYTES) {
    throw domainError(`${field} is too large.`);
  }
  return serialized;
}

function normalizeCurrencyCode(value: unknown) {
  const currencyCode = requiredText(value, "currencyCode", 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    throw domainError("currencyCode must be a three-letter ISO code.");
  }
  return currencyCode;
}

function normalizeMeasurementWindow(value: unknown) {
  if (value !== VALID_MEASUREMENT_WINDOW_DAYS) {
    throw domainError("measurementWindowDays must be 14.");
  }
  return value;
}

function normalizeIdempotencyKey(value: unknown) {
  const idempotencyKey = requiredText(
    value,
    "idempotencyKey",
    MAX_IDEMPOTENCY_KEY_LENGTH,
  );
  if (!/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)) {
    throw domainError("idempotencyKey contains unsupported characters.");
  }
  return idempotencyKey;
}

function normalizeDate(value: unknown, field: string) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw domainError(`${field} must be a valid Date.`);
  }
  return value;
}

export type CreateProfitImpactActionInput = {
  shop: string;
  idempotencyKey: string;
  actionType: ProfitImpactActionType | string;
  sourceModule: ProfitImpactSourceModule | string;
  sourceAlertKey?: string | null;
  productId?: string | null;
  productTitle?: string | null;
  title: string;
  changeDescription: string;
  currencyCode: string;
  measurementWindowDays?: number;
  previousValue?: number | null;
  appliedValue?: number | null;
  targetMetric?: string | null;
  targetValue?: number | null;
  notes?: string | null;
  metadata?: unknown;
  eventSource?: string;
};

export async function createProfitImpactAction(
  input: CreateProfitImpactActionInput,
) {
  const shop = requiredText(input.shop, "shop", 255).toLowerCase();
  if (!isProfitImpactActionType(input.actionType)) {
    throw domainError("Unsupported Profit Impact action type.");
  }
  if (!isProfitImpactSourceModule(input.sourceModule)) {
    throw domainError("Unsupported Profit Impact source module.");
  }

  const productId = optionalText(input.productId, "productId", 255);
  if (actionTypeRequiresProduct(input.actionType) && !productId) {
    throw domainError(`${input.actionType} requires productId.`);
  }

  const previousValue = optionalFiniteNumber(input.previousValue, "previousValue");
  const appliedValue = optionalFiniteNumber(input.appliedValue, "appliedValue");
  const targetValue = optionalFiniteNumber(input.targetValue, "targetValue");

  if (input.actionType === "PRICE_CHANGE" || input.actionType === "COGS_CHANGE") {
    if (previousValue === null || previousValue < 0) {
      throw domainError(`${input.actionType} requires previousValue >= 0.`);
    }
    if (appliedValue === null || appliedValue < 0) {
      throw domainError(`${input.actionType} requires appliedValue >= 0.`);
    }
  }
  if (input.actionType === "DISCOUNT_CHANGE") {
    for (const [field, value] of [
      ["previousValue", previousValue],
      ["appliedValue", appliedValue],
      ["targetValue", targetValue],
    ] as const) {
      if (value !== null && (value < 0 || value > 100)) {
        throw domainError(`${field} must be between 0 and 100.`);
      }
    }
  }

  const data = {
    shop,
    idempotencyKey: normalizeIdempotencyKey(input.idempotencyKey),
    actionType: input.actionType,
    status: "ACCEPTED" as const,
    sourceModule: input.sourceModule,
    sourceAlertKey: optionalText(
      input.sourceAlertKey,
      "sourceAlertKey",
      255,
    ),
    productId,
    productTitle: optionalText(input.productTitle, "productTitle", 255),
    title: requiredText(input.title, "title", MAX_TITLE_LENGTH),
    changeDescription: requiredText(
      input.changeDescription,
      "changeDescription",
      MAX_DESCRIPTION_LENGTH,
    ),
    currencyCode: normalizeCurrencyCode(input.currencyCode),
    measurementWindowDays: normalizeMeasurementWindow(
      input.measurementWindowDays ?? 14,
    ),
    previousValue,
    appliedValue,
    targetMetric: optionalText(input.targetMetric, "targetMetric", 80),
    targetValue,
    notes: optionalText(input.notes, "notes", MAX_NOTE_LENGTH),
    metadataJson: serializeOptionalJson(input.metadata, "metadata"),
  };

  const eventSource = requiredText(
    input.eventSource ?? "merchant",
    "eventSource",
    80,
  );

  if (data.sourceAlertKey) {
    const existingSourceAction = await prisma.profitImpactAction.findFirst({
      where: { shop, sourceAlertKey: data.sourceAlertKey, status: { not: "CANCELLED" } },
      orderBy: { createdAt: "desc" },
    });
    if (existingSourceAction) return existingSourceAction;
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const action = await tx.profitImpactAction.create({ data });
      await tx.profitImpactEvent.create({
        data: {
          actionId: action.id,
          fromStatus: null,
          toStatus: "ACCEPTED",
          source: eventSource,
        },
      });
      return action;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existingAction = await prisma.profitImpactAction.findUnique({
        where: {
          shop_idempotencyKey: {
            shop,
            idempotencyKey: data.idempotencyKey,
          },
        },
      });
      if (existingAction) return existingAction;
    }
    throw error;
  }
}

export async function getProfitImpactActionForShop({
  shop,
  actionId,
}: {
  shop: string;
  actionId: string;
}) {
  return prisma.profitImpactAction.findFirst({
    where: {
      id: requiredText(actionId, "actionId", 255),
      shop: requiredText(shop, "shop", 255).toLowerCase(),
    },
    include: {
      measurements: { orderBy: { capturedAt: "asc" } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function listProfitImpactActionsForShop({
  shop,
  statuses,
  take = 50,
}: {
  shop: string;
  statuses?: Array<ProfitImpactStatus | string>;
  take?: number;
}) {
  const normalizedStatuses = statuses?.map((status) => {
    if (!isProfitImpactStatus(status)) {
      throw domainError("Unsupported Profit Impact status.");
    }
    return status;
  });

  return prisma.profitImpactAction.findMany({
    where: {
      shop: requiredText(shop, "shop", 255).toLowerCase(),
      ...(normalizedStatuses?.length
        ? { status: { in: normalizedStatuses } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: integerInRange(take, "take", 1, 100),
    include: {
      measurements: { orderBy: { capturedAt: "asc" } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function findProfitImpactActionsBySourceKeys({
  shop,
  sourceAlertKeys,
}: {
  shop: string;
  sourceAlertKeys: string[];
}) {
  const keys = [...new Set(sourceAlertKeys.map((key) => key.trim()).filter(Boolean))];
  if (keys.length === 0) return [];
  return prisma.profitImpactAction.findMany({
    where: {
      shop: requiredText(shop, "shop", 255).toLowerCase(),
      sourceAlertKey: { in: keys },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, sourceAlertKey: true, status: true },
  });
}

export async function hasMeasuringProfitImpactActionForProduct({
  shop,
  productId,
  excludeActionId,
}: {
  shop: string;
  productId: string;
  excludeActionId?: string;
}) {
  const count = await prisma.profitImpactAction.count({
    where: {
      shop: requiredText(shop, "shop", 255).toLowerCase(),
      productId: requiredText(productId, "productId", 255),
      status: "MEASURING",
      ...(excludeActionId ? { id: { not: excludeActionId } } : {}),
    },
  });
  return count > 0;
}

export type TransitionProfitImpactActionInput = {
  shop: string;
  actionId: string;
  toStatus: ProfitImpactStatus | string;
  source?: string;
  note?: string | null;
  appliedAt?: Date;
};

export async function transitionProfitImpactAction(
  input: TransitionProfitImpactActionInput,
) {
  const shop = requiredText(input.shop, "shop", 255).toLowerCase();
  const actionId = requiredText(input.actionId, "actionId", 255);
  const toStatus = input.toStatus;
  if (!isProfitImpactStatus(toStatus)) {
    throw domainError("Unsupported Profit Impact status.");
  }
  const source = requiredText(input.source ?? "merchant", "source", 80);
  const note = optionalText(input.note, "note", MAX_NOTE_LENGTH);

  if (toStatus === "MEASURING") {
    throw domainError(
      "Use startProfitImpactMeasurement to enter MEASURING.",
      409,
    );
  }

  return prisma.$transaction(async (tx) => {
    const action = await tx.profitImpactAction.findFirst({
      where: { id: actionId, shop },
      include: { measurements: { select: { measurementType: true } } },
    });
    if (!action) throw domainError("Profit Impact action not found.", 404);
    if (!isProfitImpactStatus(action.status)) {
      throw domainError("Profit Impact action has an invalid stored status.", 409);
    }

    try {
      assertProfitImpactTransition(action.status, toStatus);
    } catch {
      throw domainError(
        `Transition ${action.status} -> ${toStatus} is not allowed.`,
        409,
      );
    }

    const hasFinalMeasurement = action.measurements.some(
      (measurement) => measurement.measurementType === "FINAL_14D",
    );
    if (toStatus === "COMPLETED" && !hasFinalMeasurement) {
      throw domainError("COMPLETED requires FINAL_14D measurement.", 409);
    }

    const now = new Date();
    const transition = await tx.profitImpactAction.updateMany({
      where: { id: actionId, shop, status: action.status },
      data: {
        status: toStatus,
        ...(toStatus === "COMPLETED" ? { completedAt: now } : {}),
        ...(toStatus === "CANCELLED" ? { cancelledAt: now } : {}),
        ...(isProfitImpactTerminalStatus(toStatus)
          ? {
            measuringProductKey: null,
            measurementClaimType: null,
            measurementClaimedAt: null,
          }
          : {}),
      },
    });

    if (transition.count !== 1) {
      throw domainError("Profit Impact action changed concurrently.", 409);
    }

    await tx.profitImpactEvent.create({
      data: {
        actionId,
        fromStatus: action.status,
        toStatus,
        source,
        note,
      },
    });

    return tx.profitImpactAction.findFirstOrThrow({
      where: { id: actionId, shop },
    });
  });
}

export type StartProfitImpactMeasurementInput = {
  shop: string;
  actionId: string;
  appliedAt: Date;
  measurementEnd: Date;
  source?: string;
  note?: string | null;
  baseline: Omit<
    CreateProfitImpactMeasurementInput,
    "shop" | "actionId" | "measurementType"
  >;
};

export async function startProfitImpactMeasurement(
  input: StartProfitImpactMeasurementInput,
) {
  const shop = requiredText(input.shop, "shop", 255).toLowerCase();
  const actionId = requiredText(input.actionId, "actionId", 255);
  const appliedAt = normalizeDate(input.appliedAt, "appliedAt");
  const measurementEnd = normalizeDate(input.measurementEnd, "measurementEnd");
  if (measurementEnd <= appliedAt) {
    throw domainError("measurementEnd must be after appliedAt.");
  }
  const source = requiredText(input.source ?? "merchant", "source", 80);
  const note = optionalText(input.note, "note", MAX_NOTE_LENGTH);
  const baseline = input.baseline;
  const windowStart = normalizeDate(baseline.windowStart, "windowStart");
  const windowEnd = normalizeDate(baseline.windowEnd, "windowEnd");
  if (windowEnd.getTime() !== appliedAt.getTime()) {
    throw domainError("BASELINE must end exactly at appliedAt.");
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const action = await tx.profitImpactAction.findFirst({
        where: { id: actionId, shop },
      });
      if (!action) throw domainError("Profit Impact action not found.", 404);
      if (action.status !== "AWAITING_APPLICATION") {
        throw domainError(
          "Only an AWAITING_APPLICATION action can start measuring.",
          409,
        );
      }

      await tx.profitImpactMeasurement.create({
        data: {
          actionId,
          measurementType: "BASELINE",
          windowStart,
          windowEnd,
          observedDays: integerInRange(baseline.observedDays, "observedDays", 1, 14),
          revenue: finiteNumber(baseline.revenue, "revenue"),
          economicProfit: finiteNumber(baseline.economicProfit, "economicProfit"),
          economicMarginPct: finiteNumber(baseline.economicMarginPct, "economicMarginPct"),
          units: finiteNumber(baseline.units, "units"),
          cogs: finiteNumber(baseline.cogs, "cogs"),
          discounts: finiteNumber(baseline.discounts, "discounts"),
          refunds: finiteNumber(baseline.refunds, "refunds"),
          averageUnitRevenue: optionalFiniteNumber(baseline.averageUnitRevenue, "averageUnitRevenue"),
          averageUnitCost: optionalFiniteNumber(baseline.averageUnitCost, "averageUnitCost"),
          discountRatePct: optionalFiniteNumber(baseline.discountRatePct, "discountRatePct"),
          measuredProfitChange: null,
          measuredMarginChange: null,
          measuredRevenueChange: null,
          measuredUnitsChange: null,
          measuredCogsChange: null,
          estimatedAttributableImpact: null,
          attributionMethod: null,
          dataConfidenceScore: integerInRange(
            baseline.dataConfidenceScore ?? 0,
            "dataConfidenceScore",
            0,
            100,
          ),
          attributionConfidenceScore: null,
          confidenceLevel: "LOW",
          confidenceReasonsJson: serializeOptionalJson(
            baseline.confidenceReasons,
            "confidenceReasons",
          ),
          sourceCompletenessJson: serializeOptionalJson(
            baseline.sourceCompleteness,
            "sourceCompleteness",
          ),
        },
      });

      const updated = await tx.profitImpactAction.updateMany({
        where: { id: actionId, shop, status: "AWAITING_APPLICATION" },
        data: {
          status: "MEASURING",
          appliedAt,
          measurementStart: appliedAt,
          measurementEnd,
          measuringProductKey: action.productId || null,
        },
      });
      if (updated.count !== 1) {
        throw domainError("Profit Impact action changed concurrently.", 409);
      }

      await tx.profitImpactEvent.create({
        data: {
          actionId,
          fromStatus: "AWAITING_APPLICATION",
          toStatus: "MEASURING",
          source,
          note,
        },
      });

      return tx.profitImpactAction.findFirstOrThrow({
        where: { id: actionId, shop },
        include: { measurements: true, events: true },
      });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw domainError(
        "This product already has an action in MEASURING.",
        409,
      );
    }
    throw error;
  }
}

export function cancelProfitImpactAction(input: {
  shop: string;
  actionId: string;
  source?: string;
  note?: string | null;
}) {
  return transitionProfitImpactAction({ ...input, toStatus: "CANCELLED" });
}

export type CreateProfitImpactMeasurementInput = {
  shop: string;
  actionId: string;
  measurementType: ProfitImpactMeasurementType | string;
  windowStart: Date;
  windowEnd: Date;
  observedDays: number;
  revenue: number;
  economicProfit: number;
  economicMarginPct: number;
  units: number;
  cogs: number;
  discounts: number;
  refunds: number;
  averageUnitRevenue?: number | null;
  averageUnitCost?: number | null;
  discountRatePct?: number | null;
  measuredProfitChange?: number | null;
  measuredMarginChange?: number | null;
  measuredRevenueChange?: number | null;
  measuredUnitsChange?: number | null;
  measuredCogsChange?: number | null;
  estimatedAttributableImpact?: number | null;
  attributionMethod?: string | null;
  dataConfidenceScore?: number;
  attributionConfidenceScore?: number | null;
  confidenceLevel?: ProfitImpactConfidenceLevel | string;
  confidenceReasons?: unknown;
  sourceCompleteness?: unknown;
  finalStatus?: "COMPLETED" | "INSUFFICIENT_DATA";
  eventSource?: string;
  eventNote?: string | null;
};

export async function createImmutableProfitImpactMeasurement(
  input: CreateProfitImpactMeasurementInput,
) {
  const shop = requiredText(input.shop, "shop", 255).toLowerCase();
  const actionId = requiredText(input.actionId, "actionId", 255);
  if (!isProfitImpactMeasurementType(input.measurementType)) {
    throw domainError("Unsupported Profit Impact measurement type.");
  }
  const confidenceLevel = input.confidenceLevel ?? "LOW";
  if (!isProfitImpactConfidenceLevel(confidenceLevel)) {
    throw domainError("Unsupported Profit Impact confidence level.");
  }
  if (input.finalStatus && input.measurementType !== "FINAL_14D") {
    throw domainError("Only FINAL_14D can finalize an action.");
  }

  const windowStart = normalizeDate(input.windowStart, "windowStart");
  const windowEnd = normalizeDate(input.windowEnd, "windowEnd");
  if (windowEnd <= windowStart) {
    throw domainError("windowEnd must be after windowStart.");
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const action = await tx.profitImpactAction.findFirst({
        where: { id: actionId, shop },
        select: { id: true, status: true },
      });
      if (!action) throw domainError("Profit Impact action not found.", 404);
      if (!isProfitImpactStatus(action.status)) {
        throw domainError("Profit Impact action has an invalid stored status.", 409);
      }
      if (isProfitImpactTerminalStatus(action.status)) {
        throw domainError("Cannot add a measurement to this action.", 409);
      }
      if (
        input.measurementType === "BASELINE" &&
        !["ACCEPTED", "AWAITING_APPLICATION"].includes(action.status)
      ) {
        throw domainError("BASELINE must be captured before measuring.", 409);
      }
      if (
        input.measurementType !== "BASELINE" &&
        action.status !== "MEASURING"
      ) {
        throw domainError(
          "Provisional and final measurements require MEASURING status.",
          409,
        );
      }

      const measurement = await tx.profitImpactMeasurement.create({
        data: {
          actionId,
          measurementType: input.measurementType,
          windowStart,
          windowEnd,
          observedDays: integerInRange(
            input.observedDays,
            "observedDays",
            1,
            365,
          ),
          revenue: finiteNumber(input.revenue, "revenue"),
          economicProfit: finiteNumber(
            input.economicProfit,
            "economicProfit",
          ),
          economicMarginPct: finiteNumber(
            input.economicMarginPct,
            "economicMarginPct",
          ),
          units: finiteNumber(input.units, "units"),
          cogs: finiteNumber(input.cogs, "cogs"),
          discounts: finiteNumber(input.discounts, "discounts"),
          refunds: finiteNumber(input.refunds, "refunds"),
          averageUnitRevenue: optionalFiniteNumber(
            input.averageUnitRevenue,
            "averageUnitRevenue",
          ),
          averageUnitCost: optionalFiniteNumber(
            input.averageUnitCost,
            "averageUnitCost",
          ),
          discountRatePct: optionalFiniteNumber(
            input.discountRatePct,
            "discountRatePct",
          ),
          measuredProfitChange: optionalFiniteNumber(
            input.measuredProfitChange,
            "measuredProfitChange",
          ),
          measuredMarginChange: optionalFiniteNumber(
            input.measuredMarginChange,
            "measuredMarginChange",
          ),
          measuredRevenueChange: optionalFiniteNumber(
            input.measuredRevenueChange,
            "measuredRevenueChange",
          ),
          measuredUnitsChange: optionalFiniteNumber(
            input.measuredUnitsChange,
            "measuredUnitsChange",
          ),
          measuredCogsChange: optionalFiniteNumber(
            input.measuredCogsChange,
            "measuredCogsChange",
          ),
          estimatedAttributableImpact: optionalFiniteNumber(
            input.estimatedAttributableImpact,
            "estimatedAttributableImpact",
          ),
          attributionMethod: optionalText(
            input.attributionMethod,
            "attributionMethod",
            80,
          ),
          dataConfidenceScore: integerInRange(
            input.dataConfidenceScore ?? 0,
            "dataConfidenceScore",
            0,
            100,
          ),
          attributionConfidenceScore:
            input.attributionConfidenceScore === null ||
              input.attributionConfidenceScore === undefined
              ? null
              : integerInRange(
                input.attributionConfidenceScore,
                "attributionConfidenceScore",
                0,
                100,
              ),
          confidenceLevel,
          confidenceReasonsJson: serializeOptionalJson(
            input.confidenceReasons,
            "confidenceReasons",
          ),
          sourceCompletenessJson: serializeOptionalJson(
            input.sourceCompleteness,
            "sourceCompleteness",
          ),
        },
      });

      if (input.finalStatus) {
        const completedAt = input.finalStatus === "COMPLETED"
          ? new Date()
          : null;
        const transition = await tx.profitImpactAction.updateMany({
          where: { id: actionId, shop, status: "MEASURING" },
          data: {
            status: input.finalStatus,
            completedAt,
            measuringProductKey: null,
            measurementClaimType: null,
            measurementClaimedAt: null,
          },
        });
        if (transition.count !== 1) {
          throw domainError("Profit Impact action changed concurrently.", 409);
        }
        await tx.profitImpactEvent.create({
          data: {
            actionId,
            fromStatus: "MEASURING",
            toStatus: input.finalStatus,
            source: requiredText(
              input.eventSource ?? "measurement-engine",
              "eventSource",
              80,
            ),
            note: optionalText(input.eventNote, "eventNote", MAX_NOTE_LENGTH),
          },
        });
      } else {
        await tx.profitImpactAction.updateMany({
          where: { id: actionId, shop },
          data: {
            measurementClaimType: null,
            measurementClaimedAt: null,
          },
        });
      }

      return measurement;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.profitImpactMeasurement.findFirst({
        where: {
          actionId,
          measurementType: input.measurementType,
          action: { shop },
        },
      });
      if (existing) return existing;
    }
    throw error;
  }
}

export async function claimProfitImpactMeasurement({
  shop,
  actionId,
  measurementType,
  now = new Date(),
  staleAfterMinutes = 20,
}: {
  shop: string;
  actionId: string;
  measurementType: "PROVISIONAL_7D" | "FINAL_14D";
  now?: Date;
  staleAfterMinutes?: number;
}) {
  const staleBefore = new Date(
    now.getTime() - Math.max(1, staleAfterMinutes) * 60_000,
  );
  const result = await prisma.profitImpactAction.updateMany({
    where: {
      id: requiredText(actionId, "actionId", 255),
      shop: requiredText(shop, "shop", 255).toLowerCase(),
      status: "MEASURING",
      OR: [
        { measurementClaimType: null },
        { measurementClaimedAt: { lt: staleBefore } },
      ],
      measurements: { none: { measurementType } },
    },
    data: {
      measurementClaimType: measurementType,
      measurementClaimedAt: now,
    },
  });
  return result.count === 1;
}

export function releaseProfitImpactMeasurementClaim({
  shop,
  actionId,
  measurementType,
}: {
  shop: string;
  actionId: string;
  measurementType: "PROVISIONAL_7D" | "FINAL_14D";
}) {
  return prisma.profitImpactAction.updateMany({
    where: {
      id: requiredText(actionId, "actionId", 255),
      shop: requiredText(shop, "shop", 255).toLowerCase(),
      measurementClaimType: measurementType,
    },
    data: {
      measurementClaimType: null,
      measurementClaimedAt: null,
    },
  });
}
