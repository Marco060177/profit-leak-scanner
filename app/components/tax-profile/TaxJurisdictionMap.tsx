const JURISDICTION_POINTS: Record<string, { x: number; y: number }> = {
  AU: { x: 244, y: 100 },
  CA: { x: 59, y: 40 },
  DE: { x: 159, y: 44 },
  ES: { x: 150, y: 56 },
  FR: { x: 153, y: 51 },
  GB: { x: 148, y: 43 },
  IE: { x: 143, y: 44 },
  IT: { x: 160, y: 57 },
  NL: { x: 154, y: 44 },
  NZ: { x: 278, y: 112 },
  US: { x: 67, y: 57 },
};

export function TaxJurisdictionMap({
  countryCode,
  countryName,
}: {
  countryCode?: string;
  countryName: string;
}) {
  const normalizedCode = countryCode?.toUpperCase() ?? "";
  const point = JURISDICTION_POINTS[normalizedCode];

  return (
    <div className="tax-map" data-has-marker={Boolean(point)}>
      <svg
        viewBox="0 0 320 150"
        role="img"
        aria-label={countryName}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="tax-map-land" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#334155" stopOpacity="0.72" />
            <stop offset="1" stopColor="#172033" stopOpacity="0.46" />
          </linearGradient>
          <radialGradient id="tax-map-atmosphere">
            <stop stopColor="#38bdf8" stopOpacity="0.1" />
            <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
          </radialGradient>
          <filter
            id="tax-map-marker-glow"
            x="-200%"
            y="-200%"
            width="500%"
            height="500%"
          >
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        <rect
          className="tax-map-atmosphere"
          x="0"
          y="0"
          width="320"
          height="150"
          rx="18"
        />
        <g className="tax-map-grid" aria-hidden="true">
          <path d="M20 50H300M20 100H300M80 18V132M160 18V132M240 18V132" />
        </g>
        <g className="tax-map-land" aria-hidden="true">
          <path d="M25 31 47 20l32 4 18 13-8 15-18 4-9 17-14-2-5-15-17-8Z" />
          <path d="m79 75 13 11 7 22-8 25-10-13 2-17-9-14Z" />
          <path d="m132 33 15-13 32 1 13 11-9 10-21 2-9 14-14-3-10-12Z" />
          <path d="m151 60 19-8 21 8 13 24-13 35-17 9-12-20 3-20-13-12Z" />
          <path d="m191 34 31-12 38 9 24 21-12 19-21-2-11 13-22-5-8-18-23-10Z" />
          <path d="m240 94 18-9 22 10 5 20-16 11-25-7-10-13Z" />
          <path d="m287 120 8-4 5 7-7 8-8-3Z" />
        </g>

        {point ? (
          <g
            className="tax-map-marker"
            transform={`translate(${point.x} ${point.y})`}
          >
            <circle
              className="tax-map-marker-glow"
              r="10"
              filter="url(#tax-map-marker-glow)"
            />
            <circle className="tax-map-marker-halo" r="7" />
            <circle className="tax-map-marker-core" r="2.7" />
          </g>
        ) : null}
      </svg>
    </div>
  );
}
