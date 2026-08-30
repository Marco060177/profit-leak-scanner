import { NATURAL_EARTH_COUNTRIES } from "./naturalEarthCountries";

export function TaxJurisdictionMap({
  countryCode,
  countryName,
}: {
  countryCode?: string;
  countryName: string;
}) {
  const normalizedCode = countryCode?.toUpperCase() ?? "";
  return (
    <div className="tax-map">
      <svg
        viewBox="0 4 360 148"
        role="img"
        aria-label={countryName}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="tax-map-land" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#334155" stopOpacity="0.68" />
            <stop offset="1" stopColor="#172033" stopOpacity="0.5" />
          </linearGradient>
          <radialGradient id="tax-map-atmosphere">
            <stop stopColor="#38bdf8" stopOpacity="0.1" />
            <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect
          className="tax-map-atmosphere"
          x="0"
          y="4"
          width="360"
          height="148"
          rx="18"
        />
        <g className="tax-map-grid" aria-hidden="true">
          <path d="M10 45H350M10 90H350M10 135H350M90 8V172M180 8V172M270 8V172" />
        </g>
        <g className="tax-map-land" aria-hidden="true">
          {NATURAL_EARTH_COUNTRIES.filter((country) => country.id !== "AQ").map(
            (country, index) => (
              <path
                key={`${country.id}-${index}`}
                className={
                  country.id === normalizedCode ? "is-current" : undefined
                }
                d={country.d}
                fillRule="evenodd"
              />
            ),
          )}
        </g>
      </svg>
    </div>
  );
}
