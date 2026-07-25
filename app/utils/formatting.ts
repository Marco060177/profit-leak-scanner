export type AppLocale = "it-IT" | "en-US";

export type FormattingOptions = {
  currencyCode?: string;
  locale?: string;
  timeZone?: string;
};

const DEFAULT_CURRENCY = "USD";
const DEFAULT_LOCALE = "en-US";
const DEFAULT_TIME_ZONE = "UTC";

export function resolveLocale(language?: string): AppLocale {
  return language === "it" ? "it-IT" : "en-US";
}

export function formatMoney(
  value: number,
  options: FormattingOptions = {},
) {
  const currencyCode =
    options.currencyCode?.trim().toUpperCase() || DEFAULT_CURRENCY;

  const locale = options.locale || DEFAULT_LOCALE;

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(value) ? value : 0);
  } catch {
    return new Intl.NumberFormat(DEFAULT_LOCALE, {
      style: "currency",
      currency: DEFAULT_CURRENCY,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(value) ? value : 0);
  }
}

export function formatMoneyCompact(
  value: number,
  options: FormattingOptions = {},
) {
  const currencyCode =
    options.currencyCode?.trim().toUpperCase() || DEFAULT_CURRENCY;

  const locale = options.locale || DEFAULT_LOCALE;

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(Number.isFinite(value) ? value : 0);
  } catch {
    return formatMoney(value, options);
  }
}

export function formatNumber(
  value: number,
  options: FormattingOptions = {},
) {
  const locale = options.locale || DEFAULT_LOCALE;

  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatInteger(
  value: number,
  options: FormattingOptions = {},
) {
  const locale = options.locale || DEFAULT_LOCALE;

  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatPercent(
  value: number,
  options: FormattingOptions = {},
) {
  const locale = options.locale || DEFAULT_LOCALE;

  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format((Number.isFinite(value) ? value : 0) / 100);
}

export function formatDate(
  value: string | Date,
  options: FormattingOptions = {},
) {
  const locale = options.locale || DEFAULT_LOCALE;
  const timeZone = options.timeZone || DEFAULT_TIME_ZONE;

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(date);
}

export function formatDateTime(
  value: string | Date,
  options: FormattingOptions = {},
) {
  const locale = options.locale || DEFAULT_LOCALE;
  const timeZone = options.timeZone || DEFAULT_TIME_ZONE;

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(date);
}