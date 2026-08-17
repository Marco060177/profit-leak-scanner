import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

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
  ready: boolean;
};

export default function MetricTooltip({
  content,
}: Props) {
  const id = useId();

  const triggerRef =
    useRef<HTMLButtonElement | null>(null);

  const tooltipRef =
    useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);

  const [mounted, setMounted] =
    useState(false);

  const [position, setPosition] =
    useState<Position>({
      top: 0,
      left: 0,
      placement: "top",
      ready: false,
    });

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;

    function updatePosition() {
      const trigger = triggerRef.current;
      const tooltip = tooltipRef.current;

      if (!trigger || !tooltip) return;

      const triggerRect =
        trigger.getBoundingClientRect();

      const tooltipRect =
        tooltip.getBoundingClientRect();

      const gap = 10;
      const viewportPadding = 12;

      const roomAbove =
        triggerRect.top;

      const roomBelow =
        window.innerHeight -
        triggerRect.bottom;

      const placement =
        roomAbove >=
          tooltipRect.height + gap ||
        roomAbove >= roomBelow
          ? "top"
          : "bottom";

      let top =
        placement === "top"
          ? triggerRect.top -
            tooltipRect.height -
            gap
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
        ready: true,
      });
    }

    updatePosition();

    window.addEventListener(
      "resize",
      updatePosition,
    );

    window.addEventListener(
      "scroll",
      updatePosition,
      true,
    );

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

    function handlePointerDown(
      event: PointerEvent,
    ) {
      const target =
        event.target as Node;

      if (
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(
      event: KeyboardEvent,
    ) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener(
      "pointerdown",
      handlePointerDown,
    );

    document.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      document.removeEventListener(
        "pointerdown",
        handlePointerDown,
      );

      document.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [open]);

  const tooltip =
    open && mounted
      ? createPortal(
          <div
            ref={tooltipRef}
            id={id}
            role="tooltip"
            style={{
              position: "fixed",

              top: position.top,
              left: position.left,

              zIndex: 999999,

              width: 300,
              maxWidth:
                "calc(100vw - 24px)",

              padding: 14,

              borderRadius: 14,

              border:
                "1px solid rgba(255,115,60,0.24)",

              background:
                "linear-gradient(145deg, #111720 0%, #080c13 100%)",

              boxShadow:
                "0 20px 55px rgba(0,0,0,0.62), 0 0 24px rgba(255,115,60,0.08)",

              color: "#f8fafc",

              opacity:
                position.ready ? 1 : 0,

              visibility:
                position.ready
                  ? "visible"
                  : "hidden",

              pointerEvents: "none",

              textTransform: "none",
              letterSpacing: "normal",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",

                  background: "#ff733c",

                  boxShadow:
                    "0 0 10px rgba(255,115,60,0.7)",

                  flexShrink: 0,
                }}
              />

              <div
                style={{
                  color: "#ffffff",

                  fontSize: 12,
                  lineHeight: 1.3,

                  fontWeight: 950,
                }}
              >
                {content.title}
              </div>
            </div>

            <div
              style={{
                marginTop: 8,

                color:
                  "rgba(226,232,240,0.78)",

                fontSize: 11,
                lineHeight: 1.5,

                fontWeight: 650,
              }}
            >
              {content.description}
            </div>

            {content.formula ? (
              <div
                style={{
                  marginTop: 10,

                  padding: "9px 10px",

                  borderRadius: 10,

                  background:
                    "rgba(255,255,255,0.035)",

                  border:
                    "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <div
                  style={{
                    color:
                      "rgba(148,163,184,0.75)",

                    fontSize: 8,
                    lineHeight: 1.2,

                    fontWeight: 950,

                    textTransform:
                      "uppercase",

                    letterSpacing:
                      "0.08em",
                  }}
                >
                  How it&apos;s calculated
                </div>

                <div
                  style={{
                    marginTop: 4,

                    color:
                      "rgba(241,245,249,0.92)",

                    fontSize: 10,
                    lineHeight: 1.45,

                    fontWeight: 700,
                  }}
                >
                  {content.formula}
                </div>
              </div>
            ) : null}

            {content.note ? (
              <div
                style={{
                  marginTop: 8,
                  paddingTop: 8,

                  borderTop:
                    "1px solid rgba(255,255,255,0.06)",

                  color:
                    "rgba(148,163,184,0.75)",

                  fontSize: 9,
                  lineHeight: 1.45,

                  fontWeight: 650,
                }}
              >
                {content.note}
              </div>
            ) : null}

            <div
              style={{
                position: "absolute",

                left: "50%",

                ...(position.placement ===
                "top"
                  ? {
                      bottom: -5,
                    }
                  : {
                      top: -5,
                    }),

                width: 9,
                height: 9,

                transform:
                  "translateX(-50%) rotate(45deg)",

                background: "#090e16",

                borderRight:
                  position.placement ===
                  "top"
                    ? "1px solid rgba(255,115,60,0.20)"
                    : "none",

                borderBottom:
                  position.placement ===
                  "top"
                    ? "1px solid rgba(255,115,60,0.20)"
                    : "none",

                borderLeft:
                  position.placement ===
                  "bottom"
                    ? "1px solid rgba(255,115,60,0.20)"
                    : "none",

                borderTop:
                  position.placement ===
                  "bottom"
                    ? "1px solid rgba(255,115,60,0.20)"
                    : "none",
              }}
            />
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"

        aria-label={`More information about ${content.title}`}

        aria-describedby={
          open ? id : undefined
        }

        aria-expanded={open}

        onMouseEnter={() => {
          setPosition((current) => ({
            ...current,
            ready: false,
          }));

          setOpen(true);
        }}

        onMouseLeave={() => {
          setOpen(false);
        }}

        onFocus={() => {
          setPosition((current) => ({
            ...current,
            ready: false,
          }));

          setOpen(true);
        }}

        onClick={(event) => {
          event.stopPropagation();

          setPosition((current) => ({
            ...current,
            ready: false,
          }));

          setOpen((current) => !current);
        }}

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
            "1px solid rgba(255,115,60,0.40)",

          background:
            "linear-gradient(180deg, rgba(255,115,60,0.14), rgba(255,115,60,0.055))",

          color: "#ff8a5c",

          boxShadow:
            "0 0 12px rgba(255,115,60,0.07)",

          fontSize: 10,
          fontWeight: 950,

          lineHeight: 1,

          cursor: "help",

          flexShrink: 0,

          outline: "none",
        }}
      >
        i
      </button>

      {tooltip}
    </>
  );
}