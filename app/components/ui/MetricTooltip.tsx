import {
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

export type MetricTooltipContent = {
  title: string;
  description: string;
  formula?: string;
  note?: string;
};

type Props = {
  content: MetricTooltipContent;
};

type Position = {
  top: number;
  left: number;
  placement: "top" | "bottom";
};

export default function MetricTooltip({
  content,
}: Props) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position>({
    top: 0,
    left: 0,
    placement: "top",
  });

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const trigger = triggerRef.current;
      const tooltip = tooltipRef.current;

      if (!trigger || !tooltip) return;

      const triggerRect = trigger.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();

      const viewportPadding = 12;
      const gap = 10;

      const availableAbove = triggerRect.top;
      const availableBelow =
        window.innerHeight - triggerRect.bottom;

      const placement =
        availableAbove >= tooltipRect.height + gap ||
        availableAbove >= availableBelow
          ? "top"
          : "bottom";

      let top =
        placement === "top"
          ? triggerRect.top - tooltipRect.height - gap
          : triggerRect.bottom + gap;

      let left =
        triggerRect.left +
        triggerRect.width / 2 -
        tooltipRect.width / 2;

      left = Math.max(
        viewportPadding,
        Math.min(
          left,
          window.innerWidth -
            tooltipRect.width -
            viewportPadding,
        ),
      );

      top = Math.max(
        viewportPadding,
        Math.min(
          top,
          window.innerHeight -
            tooltipRect.height -
            viewportPadding,
        ),
      );

      setPosition({
        top,
        left,
        placement,
      });
    }

    updatePosition();

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener(
        "resize",
        updatePosition,
      );
      window.removeEventListener(
        "scroll",
        updatePosition,
        true,
      );
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      document.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`More information about ${content.title}`}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((value) => !value)}
        style={{
          width: 17,
          height: 17,
          minWidth: 17,
          padding: 0,
          borderRadius: "50%",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          border:
            "1px solid rgba(255,115,60,0.32)",
          background:
            "linear-gradient(180deg, rgba(255,115,60,0.10), rgba(255,115,60,0.04))",
          color: "#ff8a5c",
          boxShadow:
            "inset 0 0 0 1px rgba(255,255,255,0.02)",
          fontSize: 10,
          fontWeight: 900,
          lineHeight: 1,
          cursor: "help",
          flexShrink: 0,
          outline: "none",
        }}
      >
        i
      </button>

      {open ? (
        <div
          ref={tooltipRef}
          id={id}
          role="tooltip"
          style={{
            position: "fixed",
            top: position.top,
            left: position.left,
            zIndex: 99999,
            width: "min(340px, calc(100vw - 24px))",
            padding: 16,
            borderRadius: 14,
            border:
              "1px solid rgba(255,115,60,0.22)",
            background:
              "linear-gradient(145deg, rgba(18,20,25,0.985), rgba(10,11,14,0.99))",
            boxShadow:
              "0 18px 55px rgba(0,0,0,0.48), 0 0 28px rgba(255,115,60,0.07)",
            color: "#f8fafc",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#ff733c",
                boxShadow:
                  "0 0 10px rgba(255,115,60,0.65)",
                flexShrink: 0,
              }}
            />

            <div
              style={{
                fontSize: 13,
                fontWeight: 900,
                lineHeight: 1.3,
                letterSpacing: "-0.01em",
              }}
            >
              {content.title}
            </div>
          </div>

          <div
            style={{
              fontSize: 12,
              lineHeight: 1.6,
              color: "#cbd5e1",
            }}
          >
            {content.description}
          </div>

          {content.formula ? (
            <div
              style={{
                marginTop: 12,
                padding: "10px 11px",
                borderRadius: 10,
                border:
                  "1px solid rgba(148,163,184,0.12)",
                background:
                  "rgba(255,255,255,0.025)",
              }}
            >
              <div
                style={{
                  marginBottom: 4,
                  fontSize: 9,
                  fontWeight: 900,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#94a3b8",
                }}
              >
                How it&apos;s calculated
              </div>

              <div
                style={{
                  fontSize: 11,
                  lineHeight: 1.5,
                  color: "#e2e8f0",
                }}
              >
                {content.formula}
              </div>
            </div>
          ) : null}

          {content.note ? (
            <div
              style={{
                marginTop: 10,
                fontSize: 10,
                lineHeight: 1.5,
                color: "#94a3b8",
              }}
            >
              {content.note}
            </div>
          ) : null}

          <div
            style={{
              position: "absolute",
              ...(position.placement === "top"
                ? {
                    bottom: -5,
                    borderTop:
                      "5px solid rgba(18,20,25,0.99)",
                    borderLeft:
                      "5px solid transparent",
                    borderRight:
                      "5px solid transparent",
                  }
                : {
                    top: -5,
                    borderBottom:
                      "5px solid rgba(18,20,25,0.99)",
                    borderLeft:
                      "5px solid transparent",
                    borderRight:
                      "5px solid transparent",
                  }),
              left: "50%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
            }}
          />
        </div>
      ) : null}
    </>
  );
}