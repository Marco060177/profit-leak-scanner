import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

export { FlowPath, OrbitField, SignalRing } from "~/components/ui/SignalSystem";
export type {
  FlowNode,
  OrbitNode,
  RingNode,
} from "~/components/ui/SignalSystem";

export type VisualTone =
  | "neutral"
  | "orange"
  | "blue"
  | "green"
  | "violet"
  | "cyan"
  | "amber"
  | "red";

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function PremiumPanel({
  as: Element = "section",
  tone = "neutral",
  interactive = false,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: "section" | "article" | "div" | "aside";
  tone?: VisualTone;
  interactive?: boolean;
}) {
  return (
    <Element
      className={classes(
        "ml-v2-panel",
        `ml-v2-tone-${tone}`,
        interactive && "ml-v2-panel-interactive",
        className,
      )}
      {...props}
    >
      {children}
    </Element>
  );
}

export function PremiumHero({
  eyebrow,
  title,
  description,
  actions,
  visual,
  tone = "orange",
  mobileVisualPosition = "first",
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  visual?: ReactNode;
  tone?: VisualTone;
  mobileVisualPosition?: "first" | "after-copy";
  className?: string;
}) {
  return (
    <header
      className={classes(
        "ml-v2-hero",
        Boolean(visual) && "ml-v2-hero-with-visual",
        `ml-v2-hero-mobile-${mobileVisualPosition}`,
        `ml-v2-tone-${tone}`,
        className,
      )}
    >
      <div className="ml-v2-hero-copy">
        {eyebrow ? <div className="ml-v2-eyebrow">{eyebrow}</div> : null}
        <h1 className="ml-v2-hero-title">{title}</h1>
        {description ? (
          <div className="ml-v2-hero-description">{description}</div>
        ) : null}
        {actions ? <div className="ml-v2-hero-actions">{actions}</div> : null}
      </div>
      {visual ? <div className="ml-v2-hero-visual">{visual}</div> : null}
    </header>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  icon,
  visual,
  tone = "orange",
  empty = false,
  density = "regular",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  visual?: ReactNode;
  tone?: VisualTone;
  empty?: boolean;
  density?: "regular" | "compact" | "dense";
  className?: string;
}) {
  return (
    <article
      className={classes(
        "ml-v2-metric-card",
        `ml-v2-tone-${tone}`,
        `ml-v2-metric-${density}`,
        empty && "ml-v2-is-empty",
        className,
      )}
    >
      <div className="ml-v2-metric-head">
        {icon ? <span className="ml-v2-metric-icon">{icon}</span> : null}
        <span className="ml-v2-metric-signal" aria-hidden="true" />
      </div>
      <div className="ml-v2-metric-label">{label}</div>
      <div className="ml-v2-metric-value">{value}</div>
      {detail ? <div className="ml-v2-metric-detail">{detail}</div> : null}
      {visual ? <div className="ml-v2-metric-visual">{visual}</div> : null}
    </article>
  );
}

export function StatusChip({
  children,
  tone = "neutral",
  icon,
  pulse = false,
  className,
}: {
  children: ReactNode;
  tone?: VisualTone;
  icon?: ReactNode;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={classes(
        "ml-v2-status-chip",
        `ml-v2-tone-${tone}`,
        pulse && "ml-v2-status-pulse",
        className,
      )}
    >
      {icon ?? <i aria-hidden="true" />}
      <span>{children}</span>
    </span>
  );
}

export type SegmentedTab = {
  id: string;
  label: ReactNode;
  count?: number;
  disabled?: boolean;
};

export function SegmentedTabs({
  tabs,
  activeId,
  onChange,
  ariaLabel,
  className,
}: {
  tabs: SegmentedTab[];
  activeId: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      className={classes("ml-v2-segmented-tabs", className)}
      role="tablist"
      aria-label={ariaLabel}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeId === tab.id}
          disabled={tab.disabled}
          className={activeId === tab.id ? "is-active" : undefined}
          onClick={() => onChange(tab.id)}
        >
          <span>{tab.label}</span>
          {tab.count !== undefined ? <strong>{tab.count}</strong> : null}
        </button>
      ))}
    </div>
  );
}

export function PremiumEmptyState({
  eyebrow,
  title,
  description,
  visual,
  steps,
  action,
  tone = "orange",
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  visual?: ReactNode;
  steps?: ReactNode[];
  action?: ReactNode;
  tone?: VisualTone;
  className?: string;
}) {
  return (
    <PremiumPanel
      className={classes("ml-v2-empty-state", className)}
      tone={tone}
    >
      {visual ? (
        <div className="ml-v2-empty-visual" aria-hidden="true">
          {visual}
        </div>
      ) : (
        <div className="ml-v2-empty-orbit" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      )}
      <div className="ml-v2-empty-copy">
        {eyebrow ? <div className="ml-v2-eyebrow">{eyebrow}</div> : null}
        <h2>{title}</h2>
        {description ? <div>{description}</div> : null}
        {steps?.length ? (
          <ol>
            {steps.map((step, index) => (
              <li key={index}>
                <span>{index + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        ) : null}
        {action ? <div className="ml-v2-empty-action">{action}</div> : null}
      </div>
    </PremiumPanel>
  );
}

export function VisualButton({
  variant = "primary",
  size = "medium",
  leading,
  trailing,
  className,
  children,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "small" | "medium" | "large";
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <button
      type={type}
      className={classes(
        "ml-v2-button",
        `ml-v2-button-${variant}`,
        `ml-v2-button-${size}`,
        className,
      )}
      {...props}
    >
      {leading ? <span aria-hidden="true">{leading}</span> : null}
      <span>{children}</span>
      {trailing ? <span aria-hidden="true">{trailing}</span> : null}
    </button>
  );
}

export function ControlField({
  label,
  helper,
  error,
  required = false,
  htmlFor,
  className,
  children,
}: {
  label?: ReactNode;
  helper?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={classes(
        "ml-v2-field",
        error && "ml-v2-field-error",
        className,
      )}
    >
      {label != null ? (
        <label className="ml-v2-field-label" htmlFor={htmlFor}>
          {label}
          {required ? <span aria-hidden="true">*</span> : null}
        </label>
      ) : null}
      {children}
      {error != null ? (
        <div className="ml-v2-field-message" role="alert">
          {error}
        </div>
      ) : helper != null ? (
        <div className="ml-v2-field-message">{helper}</div>
      ) : null}
    </div>
  );
}

export function VisualInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={classes("ml-v2-control", className)} {...props} />;
}

export function VisualTextarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={classes("ml-v2-control", "ml-v2-textarea", className)}
      {...props}
    />
  );
}

export function VisualSelect({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={classes("ml-v2-control", "ml-v2-select", className)}
      {...props}
    >
      {children}
    </select>
  );
}

export function ChoiceCard({
  selected = false,
  tone = "orange",
  leading,
  title,
  description,
  meta,
  className,
  type = "button",
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> & {
  selected?: boolean;
  tone?: VisualTone;
  leading?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <button
      type={type}
      className={classes(
        "ml-v2-choice-card",
        `ml-v2-tone-${tone}`,
        selected && "is-selected",
        className,
      )}
      aria-pressed={selected}
      {...props}
    >
      {leading ? (
        <span className="ml-v2-choice-leading" aria-hidden="true">
          {leading}
        </span>
      ) : null}
      <span className="ml-v2-choice-copy">
        <strong>{title}</strong>
        {description != null ? <span>{description}</span> : null}
      </span>
      {meta != null ? <span className="ml-v2-choice-meta">{meta}</span> : null}
      <i className="ml-v2-choice-signal" aria-hidden="true" />
    </button>
  );
}

export function FeedbackState({
  tone = "neutral",
  title,
  children,
  icon,
  className,
}: {
  tone?: VisualTone;
  title?: ReactNode;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  const assertive = tone === "red";
  return (
    <div
      className={classes("ml-v2-feedback", `ml-v2-tone-${tone}`, className)}
      role={assertive ? "alert" : "status"}
    >
      <span className="ml-v2-feedback-icon" aria-hidden="true">
        {icon ?? <i />}
      </span>
      <div>
        {title != null ? <strong>{title}</strong> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function ResponsiveGrid({
  columns = 4,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { columns?: 2 | 3 | 4 | 5 }) {
  return (
    <div
      className={classes("ml-v2-grid", `ml-v2-grid-${columns}`, className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function SplitLayout({
  ratio = "balanced",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  ratio?: "balanced" | "content" | "aside";
}) {
  return (
    <div
      className={classes("ml-v2-split", `ml-v2-split-${ratio}`, className)}
      {...props}
    >
      {children}
    </div>
  );
}
