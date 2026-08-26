import { useId, type CSSProperties, type ReactNode } from "react";
import type { VisualTone } from "~/components/ui/VisualSystem";

type SignalSize = "small" | "medium" | "large";
type SignalMotion = "none" | "ambient" | "active";
type SignalRingVariant = "default" | "hero" | "compact" | "embedded";

export type RingNode = {
  id: string;
  angle: number;
  tone?: VisualTone;
  emphasis?: "quiet" | "normal" | "strong";
  label?: string;
};

type SignalStyle = CSSProperties &
  Record<`--ml-signal-${string}`, string | number>;

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function SignalRing({
  value,
  tone = "orange",
  size = "medium",
  motion = "none",
  label,
  detail,
  score,
  suffix,
  status,
  info,
  ariaLabel,
  nodes = [],
  variant = "default",
  marker = true,
  className,
}: {
  value: number;
  tone?: VisualTone;
  size?: SignalSize;
  motion?: SignalMotion;
  label?: ReactNode;
  detail?: ReactNode;
  score?: ReactNode;
  suffix?: ReactNode;
  status?: ReactNode;
  info?: ReactNode;
  ariaLabel?: string;
  nodes?: RingNode[];
  variant?: SignalRingVariant;
  marker?: boolean;
  className?: string;
}) {
  const normalizedValue = clamp(value);
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const titleId = useId();

  return (
    <figure
      className={classes(
        "ml-signal-ring",
        `ml-signal-size-${size}`,
        `ml-signal-ring-${variant}`,
        `ml-signal-motion-${motion}`,
        `ml-v2-tone-${tone}`,
        className,
      )}
      role={ariaLabel || typeof label === "string" ? "img" : undefined}
      aria-label={ariaLabel}
      aria-labelledby={
        !ariaLabel && typeof label === "string" ? titleId : undefined
      }
      aria-hidden={!ariaLabel && label == null ? true : undefined}
      style={{ "--ml-signal-value": normalizedValue } as SignalStyle}
    >
      {typeof label === "string" ? (
        <figcaption id={titleId}>
          {label}: {normalizedValue}%
        </figcaption>
      ) : null}
      <svg viewBox="0 0 100 100" focusable="false">
        <circle className="ml-signal-ring-grid" cx="50" cy="50" r="44" />
        <circle className="ml-signal-ring-inner" cx="50" cy="50" r="33" />
        <circle
          className="ml-signal-ring-value"
          cx="50"
          cy="50"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={
            circumference - (circumference * normalizedValue) / 100
          }
        />
        {marker ? (
          <circle
            className="ml-signal-ring-marker"
            cx="50"
            cy="6"
            r="2.5"
            transform={`rotate(${normalizedValue * 3.6} 50 50)`}
          />
        ) : null}
      </svg>
      {nodes.map((node) => (
        <span
          key={node.id}
          className={classes(
            "ml-signal-ring-node-anchor",
            `ml-v2-tone-${node.tone ?? tone}`,
          )}
          style={{ "--ml-signal-angle": `${node.angle}deg` } as SignalStyle}
        >
          <i
            className={`ml-signal-ring-node ml-signal-ring-node-${node.emphasis ?? "normal"}`}
            title={node.label}
          />
        </span>
      ))}
      {(score != null || label != null || detail != null || status != null) && (
        <div className="ml-signal-ring-content">
          {score != null ? (
            <div className="ml-signal-ring-score">
              <strong>{score}</strong>
              {suffix != null ? <small>{suffix}</small> : null}
            </div>
          ) : null}
          {label != null ? (
            <div className="ml-signal-ring-label">
              <strong
                aria-hidden={typeof label === "string" ? true : undefined}
              >
                {label}
              </strong>
              {info != null ? (
                <span className="ml-signal-ring-info">{info}</span>
              ) : null}
            </div>
          ) : null}
          {status != null ? (
            <span className="ml-signal-ring-status">{status}</span>
          ) : null}
          {detail != null ? (
            <span className="ml-signal-ring-detail">{detail}</span>
          ) : null}
        </div>
      )}
    </figure>
  );
}

export type OrbitNode = {
  id: string;
  tone?: VisualTone;
  orbit?: 1 | 2 | 3;
  angle?: number;
  emphasis?: "quiet" | "normal" | "strong";
  label?: string;
};

export function OrbitField({
  nodes,
  tone = "orange",
  size = "medium",
  motion = "none",
  center,
  label,
  className,
}: {
  nodes: OrbitNode[];
  tone?: VisualTone;
  size?: SignalSize;
  motion?: SignalMotion;
  center?: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <figure
      className={classes(
        "ml-orbit-field",
        `ml-signal-size-${size}`,
        `ml-signal-motion-${motion}`,
        `ml-v2-tone-${tone}`,
        className,
      )}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <div className="ml-orbit-plane" aria-hidden="true">
        <i className="ml-orbit-track ml-orbit-track-1" />
        <i className="ml-orbit-track ml-orbit-track-2" />
        <i className="ml-orbit-track ml-orbit-track-3" />
        <i className="ml-orbit-axis" />
        {nodes.map((node, index) => (
          <span
            key={node.id}
            className={classes(
              "ml-orbit-node-anchor",
              `ml-orbit-${node.orbit ?? (index % 3) + 1}`,
              `ml-v2-tone-${node.tone ?? tone}`,
            )}
            style={
              {
                "--ml-signal-angle": `${node.angle ?? index * (360 / Math.max(nodes.length, 1))}deg`,
              } as SignalStyle
            }
          >
            <i
              className={`ml-orbit-node ml-orbit-node-${node.emphasis ?? "normal"}`}
              title={node.label}
            />
          </span>
        ))}
        <span className="ml-orbit-center">{center}</span>
      </div>
    </figure>
  );
}

export type FlowNode = {
  id: string;
  progress: number;
  tone?: VisualTone;
  emphasis?: "quiet" | "normal" | "strong";
  label?: string;
};

type FlowTrajectory = "rising" | "steady" | "falling" | "pulse";

const flowPaths: Record<FlowTrajectory, string> = {
  rising: "M 8 82 C 27 80, 34 56, 51 54 S 75 23, 92 18",
  steady: "M 8 52 C 24 39, 37 64, 53 51 S 77 39, 92 49",
  falling: "M 8 18 C 27 20, 34 44, 51 46 S 75 77, 92 82",
  pulse: "M 8 65 C 22 65, 24 28, 38 28 S 50 76, 62 67 S 76 37, 92 42",
};

function flowPoint(progress: number, trajectory: FlowTrajectory) {
  const p = clamp(progress, 0, 1);
  const x = 8 + p * 84;
  if (trajectory === "rising")
    return { x, y: 82 - p * 64 + Math.sin(p * Math.PI * 3) * 4 };
  if (trajectory === "falling")
    return { x, y: 18 + p * 64 + Math.sin(p * Math.PI * 3) * 4 };
  if (trajectory === "pulse")
    return { x, y: 52 + Math.sin(p * Math.PI * 4) * 23 * (1 - p * 0.25) };
  return { x, y: 51 + Math.sin(p * Math.PI * 4) * 9 };
}

export function FlowPath({
  nodes = [],
  trajectory = "rising",
  tone = "orange",
  motion = "none",
  label,
  className,
}: {
  nodes?: FlowNode[];
  trajectory?: FlowTrajectory;
  tone?: VisualTone;
  motion?: SignalMotion;
  label?: string;
  className?: string;
}) {
  const gradientId = useId().replace(/:/g, "");

  return (
    <figure
      className={classes(
        "ml-flow-path",
        `ml-flow-${trajectory}`,
        `ml-signal-motion-${motion}`,
        `ml-v2-tone-${tone}`,
        className,
      )}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop
              offset="0"
              stopColor="rgb(var(--ml-v2-accent))"
              stopOpacity="0.12"
            />
            <stop
              offset="0.62"
              stopColor="rgb(var(--ml-v2-accent))"
              stopOpacity="0.75"
            />
            <stop offset="1" stopColor="rgb(var(--ml-v2-accent))" />
          </linearGradient>
        </defs>
        <path
          className="ml-flow-grid"
          d="M 8 20 H 92 M 8 50 H 92 M 8 80 H 92"
        />
        <path className="ml-flow-shadow" d={flowPaths[trajectory]} />
        <path
          className="ml-flow-trajectory"
          d={flowPaths[trajectory]}
          stroke={`url(#${gradientId})`}
          pathLength="100"
        />
        {nodes.map((node) => {
          const point = flowPoint(node.progress, trajectory);
          return (
            <g key={node.id} className={`ml-v2-tone-${node.tone ?? tone}`}>
              <circle
                className="ml-flow-node-halo"
                cx={point.x}
                cy={point.y}
                r={node.emphasis === "strong" ? 5 : 3.7}
              />
              <circle
                className={`ml-flow-node ml-flow-node-${node.emphasis ?? "normal"}`}
                cx={point.x}
                cy={point.y}
                r="1.9"
              >
                {node.label ? <title>{node.label}</title> : null}
              </circle>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
